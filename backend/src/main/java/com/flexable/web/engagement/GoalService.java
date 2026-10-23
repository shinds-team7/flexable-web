package com.flexable.web.engagement;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.HexFormat;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.flexable.web.ai.GoalCoachClient;
import com.flexable.web.ai.GoalCoachClient.Content;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.engagement.GoalDtos.AiStatus;
import com.flexable.web.engagement.GoalDtos.Coach;
import com.flexable.web.engagement.GoalDtos.CoachResponse;
import com.flexable.web.engagement.GoalDtos.GoalInput;
import com.flexable.web.engagement.GoalDtos.GoalResponse;
import com.flexable.web.engagement.GoalDtos.GoalView;
import com.flexable.web.engagement.GoalDtos.Seed;
import com.flexable.web.seedmoney.SeedMoneyDtos.SeedMoneyResponse;
import com.flexable.web.seedmoney.SeedMoneyService;
import com.flexable.web.user.UserService;
import com.flexable.web.user.UserWithdrawalListener;

import tools.jackson.databind.MapperFeature;
import tools.jackson.databind.SerializationFeature;
import tools.jackson.databind.json.JsonMapper;

/** 목표의 공개 입구. 앱 조회·AI 호출은 트랜잭션 밖, 수정·최종 결과 저장은 짧게 잠근다. */
@Service
public class GoalService implements UserWithdrawalListener {
	private static final Logger log = LoggerFactory.getLogger(GoalService.class);
	private static final Set<String> CATEGORIES = Set.of("EMERGENCY", "TRAVEL", "DEVICE", "TUITION", "HOUSING", "OTHER");
	private static final JsonMapper JSON = JsonMapper.builder().enable(MapperFeature.SORT_PROPERTIES_ALPHABETICALLY)
		.enable(SerializationFeature.ORDER_MAP_ENTRIES_BY_KEYS).build();
	private final GoalRepository goals;
	private final GoalCoachRepository coaches;
	private final SeedMoneyService seeds;
	private final UserService users;
	private final GoalCoachClient ai;
	private final GoalCoachQuota quota;
	private final GoalCoachProperties props;
	private final Clock clock;
	private final TransactionTemplate tx;

	public GoalService(GoalRepository goals, GoalCoachRepository coaches, SeedMoneyService seeds, UserService users,
			GoalCoachClient ai, GoalCoachQuota quota, GoalCoachProperties props, Clock clock, PlatformTransactionManager manager) {
		this.goals = goals;
		this.coaches = coaches;
		this.seeds = seeds;
		this.users = users;
		this.ai = ai;
		this.quota = quota;
		this.props = props;
		this.clock = clock;
		this.tx = new TransactionTemplate(manager);
	}

	public GoalResponse get(long userId) {
		SeedMoneyResponse seed = seeds.get(userId);
		return tx.execute(ignored -> new GoalResponse(goals.findByUserId(userId).map(g -> view(g, seed)).orElse(null), aiStatus(userId)));
	}

	public GoalResponse put(long userId, GoalInput input) {
		validate(input);
		SeedMoneyResponse seed = seeds.get(userId);
		return tx.execute(ignored -> {
			users.lockForUpdate(userId);
			Goal goal = goals.findWithLockByUserId(userId).orElseGet(() -> new Goal(userId, clock.instant()));
			goal.change(input, clock.instant());
			goals.saveAndFlush(goal);
			return new GoalResponse(view(goal, seed), aiStatus(userId));
		});
	}

	public void delete(long userId) {
		tx.executeWithoutResult(ignored -> {
			users.lockForUpdate(userId);
			deleteGoal(userId);
		});
	}

	public CoachResponse coach(long userId) {
		Instant requestedAt = clock.instant().truncatedTo(ChronoUnit.MICROS);
		GoalView goal = get(userId).goal();
		if (goal == null) {
			throw new ApiException(ErrorCode.NOT_FOUND);
		}
		if (goal.coach() != null && goal.coach().aiGenerated() && !goal.coach().stale()) {
			return new CoachResponse(goal.coach(), aiStatus(userId));
		}
		String factsJson = facts(goal);
		String hash = hash(factsJson);
		Map<String, String> placeholders = GoalCoachText.placeholders(goal);
		Content content = null;
		String model = null;
		String fallback = null;
		if (!ai.enabled()) {
			fallback = "AI_UNAVAILABLE";
		}
		else if (!quota.reserve(userId)) {
			fallback = "DAILY_CAP";
		}
		else {
			GoalCoachClient.Result result = null;
			try {
				result = ai.generate(factsJson, placeholders.keySet().stream().sorted().map(k -> "{" + k + "}").toList());
			}
			catch (RuntimeException e) {
				fallback = "AI_FAILED";
			}
			if (result != null) {
				try {
					content = GoalCoachText.validate(result.content(), placeholders);
					model = result.model();
				}
				catch (RuntimeException e) {
					fallback = "AI_REJECTED";
				}
				log.info("goal-coach reason={} promptTokens={} completionTokens={}", fallback == null ? "SUCCESS" : fallback,
						result.promptTokens(), result.completionTokens());
			}
			else {
				fallback = "AI_FAILED";
				log.info("goal-coach reason=AI_FAILED");
			}
		}
		if (fallback != null) {
			content = GoalCoachText.fallback(goal.progress().status(), placeholders);
		}
		Content savedContent = content;
		String savedModel = model;
		String savedFallback = fallback;
		Coach saved = tx.execute(ignored -> {
			try {
				users.lockForUpdate(userId);
			}
			catch (ApiException e) {
				throw new ApiException(ErrorCode.GOAL_CHANGED);
			}
			Goal current = goals.findWithLockByUserId(userId).orElseThrow(() -> new ApiException(ErrorCode.GOAL_CHANGED));
			if (current.id != goal.id() || current.version != goal.version()) {
				throw new ApiException(ErrorCode.GOAL_CHANGED);
			}
			GoalCoach stored = coaches.findById(userId).orElseGet(GoalCoach::new);
			if (stored.requestedAt != null && stored.requestedAt.isAfter(requestedAt)) {
				return coachView(stored, hash);
			}
			stored.userId = userId;
			stored.goalId = goal.id();
			stored.goalVersion = goal.version();
			stored.factsHash = hash;
			stored.aiGenerated = savedFallback == null;
			stored.model = savedFallback == null ? savedModel : null;
			stored.fallbackReason = savedFallback;
			stored.content = JSON.writeValueAsString(savedContent);
			stored.requestedAt = requestedAt;
			stored.generatedAt = clock.instant();
			return coachView(coaches.saveAndFlush(stored), hash);
		});
		return new CoachResponse(saved, aiStatus(userId));
	}

	private AiStatus aiStatus(long userId) {
		boolean enabled = ai.enabled();
		return new AiStatus(enabled, "FREE", props.freeDailyLimit(), enabled ? quota.remaining(userId) : props.freeDailyLimit());
	}

	private GoalView view(Goal g, SeedMoneyResponse app) {
		boolean fromApp = "app".equals(app.source()) && "available".equals(app.status());
		long current = fromApp ? app.total() : g.currentAmount == null ? 0 : g.currentAmount;
		Long pace = fromApp ? app.monthlyGoal() : g.monthlyPace;
		if (pace != null && pace <= 0) {
			pace = null;
		}
		Seed seed = new Seed(fromApp ? "app" : "manual", current, pace,
				fromApp ? app.updatedAt() : at(g.updatedAt), app.status());
		var calc = GoalMath.calculate(g.amount, current, pace, YearMonth.parse(g.dueMonth),
				YearMonth.from(clock.instant().atZone(GoalCoachQuota.SEOUL)));
		GoalView view = new GoalView(g.id, g.version, g.category, g.name, g.amount, g.dueMonth, g.currentAmount,
				g.monthlyPace, at(g.createdAt), at(g.updatedAt), seed, calc.progress(), calc.scenarios(), calc.checkpoints(), null);
		Coach coach = coaches.findById(g.userId).map(c -> coachView(c, hash(facts(view)))).orElse(null);
		return new GoalView(view.id(), view.version(), view.category(), view.name(), view.amount(), view.dueMonth(),
				view.currentAmount(), view.monthlyPace(), view.createdAt(), view.updatedAt(), seed,
				view.progress(), view.scenarios(), view.checkpoints(), coach);
	}

	private Coach coachView(GoalCoach saved, String currentHash) {
		Content content = JSON.readValue(saved.content, Content.class);
		return new Coach(saved.aiGenerated, saved.model, saved.fallbackReason, at(saved.generatedAt),
				!saved.factsHash.equals(currentHash), content.headline(), content.summary(), content.steps(), "GOAL_AI",
				saved.aiGenerated ? "AI가 내 목표 숫자로 쓴 안내예요. 금융 상품 추천이나 투자 권유가 아니고, 실제 결과는 달라질 수 있어요."
						: "정해 둔 기본 안내예요. 금융 상품 추천이나 투자 권유가 아니에요.");
	}

	private static OffsetDateTime at(Instant instant) {
		return instant.atZone(GoalCoachQuota.SEOUL).toOffsetDateTime();
	}

	private static String facts(GoalView goal) {
		Map<String, Object> facts = new TreeMap<>();
		facts.put("category", goal.category());
		facts.put("amount", goal.amount());
		facts.put("dueMonth", goal.dueMonth());
		facts.put("thisMonth", goal.progress().thisMonth());
		facts.put("seed", Map.of("source", goal.seed().source()));
		facts.put("progress", goal.progress());
		facts.put("scenarios", goal.scenarios());
		facts.put("checkpoints", goal.checkpoints());
		return JSON.writeValueAsString(facts);
	}

	private static String hash(String facts) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(facts.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException("SHA-256");
		}
	}

	private void validate(GoalInput input) {
		if (input.category() == null || !CATEGORIES.contains(input.category())) {
			throw ApiException.invalid("category", "목표 종류를 골라 주세요");
		}
		String name = input.name() == null ? "" : input.name().strip();
		if (name.isEmpty() || name.codePointCount(0, name.length()) > 20) {
			throw ApiException.invalid("name", "목표 이름은 1~20자로 입력해 주세요");
		}
		if (input.amount() == null || input.amount() < 10000 || input.amount() > 1_000_000_000) {
			throw ApiException.invalid("amount", "목표 금액은 1만 원~10억 원으로 입력해 주세요");
		}
		try {
			if (input.dueMonth() == null || !input.dueMonth().matches("\\d{4}-\\d{2}")) {
				throw new IllegalArgumentException();
			}
			long months = ChronoUnit.MONTHS.between(YearMonth.from(clock.instant().atZone(GoalCoachQuota.SEOUL)), YearMonth.parse(input.dueMonth()));
			if (months < 1 || months > 120) {
				throw new IllegalArgumentException();
			}
		}
		catch (RuntimeException e) {
			throw ApiException.invalid("dueMonth", "기한은 다음 달부터 120개월 안으로 정해 주세요");
		}
		if (input.currentAmount() != null && (input.currentAmount() < 0 || input.currentAmount() > 1_000_000_000)) {
			throw ApiException.invalid("currentAmount", "지금 모은 돈은 0원~10억 원으로 입력해 주세요");
		}
		if (input.monthlyPace() != null && (input.monthlyPace() < 0 || input.monthlyPace() > 100_000_000)) {
			throw ApiException.invalid("monthlyPace", "매달 모을 돈은 0원~1억 원으로 입력해 주세요");
		}
	}

	private void deleteGoal(long userId) {
		coaches.deleteById(userId);
		coaches.flush();
		goals.findWithLockByUserId(userId).ifPresent(goals::delete);
	}

	@Override
	public void onWithdraw(long userId) {
		deleteGoal(userId);
		quota.deleteForUser(userId);
	}
}
