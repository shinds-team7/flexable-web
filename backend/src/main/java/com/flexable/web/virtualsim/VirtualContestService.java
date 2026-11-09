package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;
import java.util.function.Supplier;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.market.MarketDtos.PriceRow;
import com.flexable.web.market.MarketService;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.virtualsim.VirtualContestDtos.*;
import com.flexable.web.virtualsim.VirtualContestRules.Order;
import com.flexable.web.virtualsim.VirtualContestRules.Standing;
import com.flexable.web.virtualsim.VirtualContestStore.ContestRow;
import com.flexable.web.virtualsim.VirtualContestStore.EntryRow;
import com.flexable.web.virtualsim.VirtualContestStore.PlacementRow;
import com.flexable.web.virtualsim.VirtualContestStore.RoundRow;
import com.flexable.web.virtualsim.VirtualSimDtos.Started;
import com.flexable.web.virtualsim.VirtualSimGenerator.Plan;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;
import com.flexable.web.virtualsim.VirtualSimStore.Company;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 가상 시뮬레이션 대회(decisions/2026-11-05-virtual-sim-contest, policies §8-8). 회원만 참가하고, 시즌(한 달)마다 배치고사로 시작 판을 정한 뒤
 * 가상 시뮬레이션 세션(VirtualSimService)으로 판을 진행한다. 판이 끝나면(완주·종료·만료·서버 재시작·새 판·마감) 저장한 시드·룰셋·가상 종목·제출한
 * 매매로 남은 봉을 끝까지 돌려 마지막 봉 총자산을 새 잔액으로 한 번만 반영한다. 하루 점수·주간 승급/강등은 날·주가 끝난 뒤 한 번씩만 정한다.
 * 세션과 같은 잠금(VirtualSimService 인스턴스)으로 직렬화한다. 로그에는 회원 번호·판 번호·결과 구분만 남기고 잔액·매매·토큰은 남기지 않는다.
 */
@Service
public class VirtualContestService implements VirtualSimService.RoundListener {

	private static final Logger log = LoggerFactory.getLogger(VirtualContestService.class);
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");
	private static final Duration ROUND_TTL = Duration.ofMinutes(30);
	private static final int HISTORY = 12;
	private static final int RECENT_ROUNDS = 30;

	private final VirtualContestStore db;
	private final VirtualSimStore sims;
	private final VirtualSimService sim;
	private final MarketService market;
	private final Clock clock;
	private final TransactionTemplate tx;
	private final SecureRandom random = new SecureRandom();
	private final JsonMapper json = JsonMapper.builder().findAndAddModules().build();

	public VirtualContestService(VirtualContestStore db, VirtualSimStore sims, VirtualSimService sim, MarketService market, Clock clock,
			PlatformTransactionManager manager) {
		this.db = db;
		this.market = market;
		this.sims = sims;
		this.sim = sim;
		this.clock = clock;
		this.tx = new TransactionTemplate(manager);
		sim.attach(this);
	}

	/**
	 * 배치고사 문제 사본(채점하면 주요 내용·AI 요약까지 함께 지운다). 실제 과거 공시 하나와 정답 방향(up). company·date는 풀 때 숨기고 결과에서 공개한다.
	 * basis: 채점 기준. REACTION(반응 창, 11-09 결정)이면 up = 공시 직후 방향이고 reactionRate·nextWeekRate가 있다. null이면 이 규칙 전에 만든 사본이라
	 * 5거래일 기준(up·returnRate = 기준 봉 종가 → 5번째 후속 거래일 종가)으로 채점한다.
	 * details: 공시 주요 내용(없으면 null), summary: 공시 AI 요약(없으면 null, 채점하면 주요 내용과 함께 지운다).
	 * trend·upShare·downShare·paths는 출제할 때의 룰셋 유형 통계(룰셋에 없는 유형이면 null)
	 */
	record StoredQuestion(String id, String company, String industry, VirtualSimCategory category, String title, String body,
			List<PlacementDetails.Detail> details, String date, Boolean up, BigDecimal returnRate, String trend, BigDecimal upShare, BigDecimal downShare,
			Integer paths, String summary, String basis, BigDecimal reactionRate, BigDecimal nextWeekRate) {
	}

	/** 실제 공시 문제 풀(6시간마다 다시 만든다). 예시 자료면 쓰지 않는다 */
	private List<VirtualContestQuestions.Past> realPool;
	private Instant realPoolAt;
	private static final Duration POOL_TTL = Duration.ofHours(6);
	private static final int POOL_YEARS = 5;

	private List<VirtualContestQuestions.Past> pool(VirtualSimRuleset rules) {
		if (sim.sample()) {
			Map<String, Map<VirtualSimCategory, String>> bodies = new HashMap<>();
			Map<String, String> industries = new HashMap<>();
			for (Company company : sims.companies(true, VirtualSimChecker.VERSION)) {
				bodies.put(company.name(), company.bodies());
				industries.put(company.name(), company.industry());
			}
			return VirtualContestQuestions.sample(bodies, industries, rules, random);
		}
		if (realPool == null || realPoolAt.plus(POOL_TTL).isBefore(now())) {
			LocalDate from = today().minusYears(POOL_YEARS);
			Set<String> archived = new HashSet<>(sims.archivedStocks());
			Map<String, String> industries = market.industries();
			List<VirtualContestQuestions.Past> out = new ArrayList<>();
			for (var stock : market.rankedStocks()) {
				if (!archived.contains(stock.code())) {
					continue;
				}
				var rows = market.dailyPrices(stock.code(), from);
				var details = sims.details(stock.code());
				var filings = sims.disclosures(stock.code()).stream()
					.filter(d -> !d.date().isBefore(from))
					.map(d -> new VirtualContestQuestions.Filing(d.receiptNo(), d.title(), d.date(), details.get(d.receiptNo())))
					.toList();
				out.addAll(VirtualContestQuestions.fromFilings(stock.name(), industries.getOrDefault(stock.code(), "업종 미분류"), filings,
						rows.stream().map(PriceRow::date).toList(), rows.stream().map(PriceRow::close).toList()));
			}
			realPool = List.copyOf(out);
			realPoolAt = now();
			log.info("배치고사 문제 풀 {}건", realPool.size());
		}
		return realPool;
	}

	private <T> T locked(Supplier<T> work) {
		synchronized (sim) {
			return work.get();
		}
	}

	private Instant now() {
		return clock.instant();
	}

	private LocalDate today() {
		return LocalDate.ofInstant(now(), SEOUL);
	}

	private static String format(Instant i) {
		return i == null ? null : DATE_TIME.format(i.atZone(SEOUL));
	}

	// ───────── 대회 ─────────

	private ContestRow ensure(YearMonth month) {
		return db.ensureContest(VirtualContestRules.contestId(month), month.atDay(1).atStartOfDay(SEOUL).toInstant(),
				month.plusMonths(1).atDay(1).atStartOfDay(SEOUL).toInstant());
	}

	private ContestRow currentContest() {
		return ensure(YearMonth.from(now().atZone(SEOUL)));
	}

	/** 이번 달 대회가 열려 있어야 한다(기간 밖은 409 CONTEST_CLOSED) */
	private ContestRow openContest() {
		ContestRow c = currentContest();
		if (!c.open() || now().isBefore(c.startsAt()) || !now().isBefore(c.endsAt())) {
			throw new ApiException(ErrorCode.CONTEST_CLOSED);
		}
		return c;
	}

	private static YearMonth month(ContestRow c) {
		return YearMonth.parse(c.id());
	}

	/** 지금 쓰는 룰셋. id는 실제 룰셋 행 번호(예시 룰셋이면 null) */
	private record Rules(Long id, VirtualSimRuleset rules) {
	}

	private Optional<Rules> rules() {
		if (sim.sample()) {
			return Optional.of(new Rules(null, VirtualSimSample.ruleset()));
		}
		return sims.latestStoredRuleset(false).map(r -> new Rules(r.id(), r.ruleset()));
	}

	private List<String> trends(Company c, VirtualSimRuleset rules) {
		return c.bodies().keySet().stream().map(rules::stats).flatMap(Optional::stream).map(CategoryStats::trend).toList();
	}

	private List<Company> candidates(VirtualSimRuleset rules, VirtualContestBoard board) {
		return sims.companies(sim.sample(), VirtualSimChecker.VERSION).stream().filter(c -> VirtualContestRules.candidate(trends(c, rules), board)).toList();
	}

	public Contest current() {
		return locked(() -> {
			ContestRow c = currentContest();
			YearMonth m = month(c);
			Optional<Rules> rules = rules();
			List<BoardInfo> boards = Arrays.stream(VirtualContestBoard.values())
				.map(b -> new BoardInfo(b, b.seedMoney(), Arrays.stream(b.grades()).boxed().toList(), db.countEntries(c.id(), b),
						rules.map(r -> !candidates(r.rules(), b).isEmpty()).orElse(false)))
				.toList();
			List<Week> weeks = new ArrayList<>();
			var ranges = VirtualContestRules.weeks(m);
			for (int i = 0; i < ranges.size(); i++) {
				weeks.add(new Week(i + 1, ranges.get(i)[0].toString(), ranges.get(i)[1].toString()));
			}
			return new Contest(c.id(), format(c.startsAt()), format(c.endsAt()), weeks, boards,
					new VirtualContestDtos.Rules(VirtualContestRules.ROUNDS_PER_DAY, VirtualContestRules.ROUNDS_FOR_SCORE, VirtualContestRules.EVENTS, VirtualContestRules.DAILY_TARGET,
							VirtualContestRules.PROMOTE_AT, VirtualContestRules.DEMOTE_AT, VirtualContestRules.PLACEMENT_QUESTIONS,
							new Cuts(VirtualContestRules.CUT_B50M, VirtualContestRules.CUT_B100M), VirtualContestRules.LIQUIDATION_BELOW,
							VirtualContestRules.RANKING_TOP));
		});
	}

	// ───────── 별명 ─────────

	private String ensureAlias(long userId) {
		Optional<String> existing = db.alias(userId);
		if (existing.isPresent()) {
			return existing.get();
		}
		for (int i = 0; i < 50; i++) {
			String alias = VirtualContestAlias.draw(random);
			if (db.insertAlias(userId, alias, now())) {
				return alias;
			}
		}
		throw new IllegalStateException("대회 별명을 정하지 못했어요");
	}

	// ───────── 배치고사 ─────────

	public Placement startPlacement(long userId) {
		return locked(() -> {
			ContestRow c = openContest();
			if (db.entry(c.id(), userId).isPresent()) {
				throw new ApiException(ErrorCode.CONTEST_ALREADY_JOINED);
			}
			Optional<PlacementRow> existing = db.placement(c.id(), userId).filter(p -> !discardLegacy(p));
			if (existing.isPresent()) {
				PlacementRow p = existing.get();
				if (p.gradedAt() == null && !now().isBefore(p.expiresAt())) {
					grade(p, Map.of());
				}
				if (p.gradedAt() != null || !now().isBefore(p.expiresAt())) {
					throw new ApiException(ErrorCode.CONTEST_ALREADY_JOINED);
				}
				return placement(p);
			}
			Rules rules = rules().orElseThrow(() -> new ApiException(ErrorCode.PRACTICE_UNAVAILABLE));
			// 실제 과거 공시 10개: 반응 창 근거 유형 4개 + 유형 상관없이 6개(decisions/2026-11-09-placement-reaction-window)
			List<VirtualContestQuestions.Past> drawn = VirtualContestQuestions.draw(pool(rules.rules()), random);
			if (drawn.isEmpty()) {
				throw new ApiException(ErrorCode.PRACTICE_UNAVAILABLE);
			}
			// 공시 AI 요약: 실제 공시는 뽑은 공시의 접수번호로 지금 저장된 요약(숨기지 않은 것)을 붙이고, 예시 자료는 유형별 예시 글
			Map<String, String> summaries = sim.sample() ? Map.of() : sims.summaries(drawn.stream().map(VirtualContestQuestions.Past::key).toList());
			List<StoredQuestion> questions = new ArrayList<>();
			for (int k = 0; k < drawn.size(); k++) {
				VirtualContestQuestions.Past q = drawn.get(k);
				Optional<CategoryStats> st = rules.rules().stats(q.category());
				questions.add(new StoredQuestion("q" + (k + 1), q.company(), q.industry(), q.category(), q.title(), q.body(), q.details(),
						q.date() == null ? null : q.date().toString(), q.up(), null,
						st.map(CategoryStats::trend).orElse(null), st.map(CategoryStats::upShare).orElse(null),
						st.map(x -> VirtualSimRules.upShare(x.paths(), x.down())).orElse(null), st.map(CategoryStats::paths).orElse(null),
						sim.sample() ? VirtualSimSample.summary(q.category()) : summaries.get(q.key()), VirtualContestQuestions.REACTION, q.reactionRate(),
						q.nextWeekRate()));
			}
			String id = UUID.randomUUID().toString();
			Instant started = now();
			tx.executeWithoutResult(t -> {
				ensureAlias(userId);
				db.insertPlacement(id, c.id(), userId, json.writeValueAsString(questions), started,
						started.plus(Duration.ofMinutes(VirtualContestRules.PLACEMENT_MINUTES)));
			});
			return placement(db.placementById(id).orElseThrow());
		});
	}

	/**
	 * 실제 공시 배치고사 전에 만든(정답 방향 up이 없는) 채점 전 배치고사는 새 규칙으로 채점할 수 없어 지운다(참가 전이라 잃는 기록 없음). 지웠으면 true
	 */
	private boolean discardLegacy(PlacementRow p) {
		if (p.gradedAt() != null || p.questions() == null || questions(p).stream().allMatch(q -> q.up() != null)) {
			return false;
		}
		db.deletePlacement(p.id());
		log.info("이전 형식 배치고사 삭제 user={}", p.userId());
		return true;
	}

	private List<StoredQuestion> questions(PlacementRow p) {
		return json.readValue(p.questions(), new TypeReference<List<StoredQuestion>>() {
		});
	}

	private Placement placement(PlacementRow p) {
		List<Question> qs = questions(p).stream()
			.map(q -> new Question(q.id(), q.industry(), q.category(), q.category().displayName(), q.title(), q.body(), q.details(), q.summary()))
			.toList();
		return new Placement(p.id(), format(p.expiresAt()), qs);
	}

	/**
	 * 사본의 정답 방향(up)으로 채점하고 참가시킨다(한 번만). answers에 없는 문제는 틀림. 반응 창 사본은 공시 직후 방향, 이 규칙 전에 만든 사본(basis 없음)은
	 * 5거래일 방향이다(11-09 결정: 배포 전에 시작한 배치고사는 시작할 때의 기준으로 채점)
	 */
	private void grade(PlacementRow p, Map<String, Prediction> answers) {
		List<GradedItem> items = new ArrayList<>();
		for (StoredQuestion q : questions(p)) {
			Prediction pr = answers.get(q.id());
			boolean reaction = VirtualContestQuestions.REACTION.equals(q.basis());
			items.add(new GradedItem(q.id(), pr, q.company(), q.date(), reaction ? VirtualContestQuestions.REACTION : VirtualContestQuestions.FIVE_DAY,
					q.up() ? "UP" : "DOWN", reaction ? q.reactionRate() : null, reaction ? q.nextWeekRate() : null, reaction ? null : q.returnRate(),
					VirtualContestRules.placementCorrect(q.up(), pr), q.trend(), q.upShare(), q.downShare(), q.paths()));
		}
		int correct = (int) items.stream().filter(GradedItem::correct).count();
		VirtualContestBoard board = VirtualContestRules.placementBoard(correct);
		Instant at = now();
		tx.executeWithoutResult(t -> {
			if (db.gradePlacement(p.id(), json.writeValueAsString(items), correct, board, at)) {
				db.insertEntry(p.contestId(), p.userId(), correct, board, at);
				log.info("대회 배치고사 채점 user={} board={}", p.userId(), board);
			}
		});
	}

	public PlacementResult answer(long userId, Answers input) {
		return locked(() -> {
			PlacementRow p = db.placementById(input.placementId()).filter(r -> r.userId() == userId)
				.orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
			if (p.gradedAt() == null) {
				if (discardLegacy(p)) {
					throw new ApiException(ErrorCode.PRACTICE_CONFLICT, "배치고사 문제가 바뀌었어요. 배치고사를 다시 시작해 주세요");
				}
				if (p.questions() == null) {
					// 대회가 끝날 때 마치지 않은 배치고사
					throw new ApiException(ErrorCode.CONTEST_CLOSED);
				}
				if (!now().isBefore(p.expiresAt())) {
					grade(p, Map.of());
				}
				else {
					ContestRow c = db.contest(p.contestId()).orElseThrow();
					if (!c.open() || !now().isBefore(c.endsAt())) {
						throw new ApiException(ErrorCode.CONTEST_CLOSED);
					}
					Set<String> ids = new HashSet<>(questions(p).stream().map(StoredQuestion::id).toList());
					Map<String, Prediction> answers = new HashMap<>();
					for (Answer a : input.answers()) {
						if (!ids.contains(a.questionId()) || answers.containsKey(a.questionId())) {
							throw ApiException.invalid("answers", "문제를 다시 확인해 주세요");
						}
						answers.put(a.questionId(), a.prediction());
					}
					if (answers.size() != VirtualContestRules.PLACEMENT_QUESTIONS) {
						throw ApiException.invalid("answers", "문제를 다시 확인해 주세요");
					}
					grade(p, answers);
				}
				p = db.placementById(p.id()).orElseThrow();
			}
			// 이 규칙 전에 채점한 결과(basis 없음)는 5거래일 기준이다
			List<GradedItem> items = json.readValue(p.result(), new TypeReference<List<GradedItem>>() {
			}).stream().map(i -> i.basis() != null ? i : i.withBasis(VirtualContestQuestions.FIVE_DAY)).toList();
			EntryRow e = db.entry(p.contestId(), userId).orElseThrow();
			return new PlacementResult(p.id(), p.correct(), VirtualContestRules.PLACEMENT_QUESTIONS, VirtualContestBoard.valueOf(p.board()), items, entry(e));
		});
	}

	// ───────── 판 ─────────

	public RoundStarted startRound(long userId, UUID startId) {
		return locked(() -> {
			ContestRow c = openContest();
			EntryRow e = db.entry(c.id(), userId).orElseThrow(() -> new ApiException(ErrorCode.CONTEST_NOT_JOINED));
			Optional<RoundRow> same = db.roundByStartId(e.id(), startId.toString());
			if (same.isPresent()) {
				RoundRow r = same.get();
				Started s = r.active() ? sim.contestStarted(r.id()).orElse(null) : null;
				if (s == null) {
					throw new ApiException(ErrorCode.PRACTICE_CONFLICT);
				}
				return new RoundStarted(s.sessionToken(), s.expiresAt(), s.snapshot(), roundInfo(r));
			}
			if (e.liquidated()) {
				throw new ApiException(ErrorCode.CONTEST_LIQUIDATED);
			}
			LocalDate today = today();
			if (db.rounds(e.id(), today).size() >= VirtualContestRules.ROUNDS_PER_DAY) {
				long wait = Duration.between(now(), today.plusDays(1).atStartOfDay(SEOUL).toInstant()).toSeconds();
				throw new ApiException(ErrorCode.CONTEST_DAILY_LIMIT, ErrorCode.CONTEST_DAILY_LIMIT.message(), Map.of("retryAfterSeconds", Math.max(1, wait)));
			}
			sim.clean();
			// 진행 중인 판이 있으면 남은 사건을 유지로 끝까지 돌려 정산하고, 끝난 날·주를 먼저 판정한다(판이 바뀌면 새 판으로 시작)
			db.activeRound(e.id()).ifPresent(r -> {
				sim.dropContest(r.id());
				settle(r, "REPLACED");
			});
			catchUp(e);
			e = db.entry(e.id()).orElseThrow();
			if (e.liquidated()) {
				throw new ApiException(ErrorCode.CONTEST_LIQUIDATED);
			}
			Rules rules = rules().orElseThrow(() -> new ApiException(ErrorCode.PRACTICE_UNAVAILABLE));
			List<Company> choices = candidates(rules.rules(), e.board());
			if (choices.isEmpty()) {
				throw new ApiException(ErrorCode.PRACTICE_UNAVAILABLE);
			}
			if (!sim.hasCapacity()) {
				throw new ApiException(ErrorCode.PRACTICE_CAPACITY);
			}
			Company company = choices.get(random.nextInt(choices.size()));
			long seed = random.nextLong();
			List<VirtualSimCategory> categories = List.copyOf(company.bodies().keySet());
			Plan plan = VirtualSimGenerator.generate(seed, rules.rules(), categories, today, e.board().rule());
			Instant started = now();
			Instant expires = started.plus(ROUND_TTL);
			int number = db.countRounds(e.id()) + 1;
			EntryRow entry = e;
			long roundId = db.insertRound(entry.id(), startId.toString(), number, entry.board(), today, entry.balance(), started, expires, seed, rules.id(),
					company.id(), String.join(",", categories.stream().map(Enum::name).toList()));
			Started s;
			try {
				s = sim.startContest(new VirtualSimService.ContestLink(roundId, c.id(), entry.board(), number, c.endsAt()), entry.balance(), rules.rules(),
						company, plan, expires);
			}
			catch (RuntimeException ex) {
				db.deleteRound(roundId);
				throw ex;
			}
			log.info("대회 판 시작 user={} round={} board={}", userId, roundId, entry.board());
			return new RoundStarted(s.sessionToken(), s.expiresAt(), s.snapshot(), roundInfo(db.round(roundId).orElseThrow()));
		});
	}

	/** 판 번호·시작 잔액·그날 이 판을 뺀 남은 판 수 */
	private RoundInfo roundInfo(RoundRow r) {
		long upTo = db.rounds(r.entryId(), r.day()).stream().filter(x -> x.id() <= r.id()).count();
		return new RoundInfo(r.roundNumber(), r.startBalance(), (int) Math.max(0, VirtualContestRules.ROUNDS_PER_DAY - upTo));
	}

	// ───────── 세션 알림(VirtualSimService가 같은 잠금 안에서 부른다) ─────────

	@Override
	public void onOrder(long roundId, int event, Action action, long quantity) {
		RoundRow r = db.round(roundId).filter(RoundRow::active).orElseThrow(() -> new ApiException(ErrorCode.PRACTICE_CONFLICT));
		Map<Integer, Order> orders = new HashMap<>(orders(r));
		orders.put(event, new Order(action, quantity));
		if (!db.saveOrders(roundId, json.writeValueAsString(orders))) {
			throw new ApiException(ErrorCode.PRACTICE_CONFLICT);
		}
	}

	@Override
	public void onFinished(long roundId) {
		db.round(roundId).ifPresent(r -> settle(r, "COMPLETED"));
	}

	@Override
	public void onEnded(long roundId, String reason) {
		db.round(roundId).ifPresent(r -> settle(r, reason));
	}

	private Map<Integer, Order> orders(RoundRow r) {
		if (r.orders() == null || r.orders().equals("[]")) {
			return Map.of();
		}
		return json.readValue(r.orders(), new TypeReference<Map<Integer, Order>>() {
		});
	}

	/** 저장한 입력으로 판을 다시 만든다. 지원하지 않는 생성기 버전·사라진 룰셋·회사면 비어 있다 */
	private Optional<Plan> replan(RoundRow r) {
		if (!VirtualSimGenerator.SUPPORTED.contains(r.generator())) {
			log.error("지원하지 않는 생성기 버전의 대회 판 round={} generator={}", r.id(), r.generator());
			return Optional.empty();
		}
		Optional<VirtualSimRuleset> rules = r.rulesetId() == null ? Optional.of(VirtualSimSample.ruleset()) : sims.ruleset(r.rulesetId());
		if (rules.isEmpty()) {
			log.error("대회 판의 룰셋이 없어요 round={}", r.id());
			return Optional.empty();
		}
		List<VirtualSimCategory> categories = Arrays.stream(r.categories().split(",")).map(VirtualSimCategory::valueOf).toList();
		return Optional.of(VirtualSimGenerator.generate(r.seed(), rules.get(), categories, r.day(), r.board().rule(r.generator())));
	}

	/**
	 * 판 정산(결정 기록 5): 제출한 매매는 체결하고 고르지 않은 사건은 유지로 마지막 봉까지 돌려 총자산을 새 잔액으로 한 번만 반영한다.
	 * 정산하면 시드·룰셋·회사·매매는 지운다. 지원하지 않는 버전이면 그대로 두고 오류 로그를 남긴다(운영자가 이전 버전으로 정산).
	 */
	private void settle(RoundRow r, String reason) {
		if (!r.active()) {
			return;
		}
		Optional<Plan> plan = replan(r);
		if (plan.isEmpty()) {
			return;
		}
		Map<Integer, Order> fills = new HashMap<>();
		orders(r).forEach((event, order) -> fills.put(plan.get().events().get(event).index() + 1, order));
		long end = VirtualContestRules.play(plan.get().candles(), r.startBalance(), fills).total();
		// 하루 점수의 비교 기준: 같은 봉에서 사건마다 유지만 했을 때의 끝 잔액
		long hold = VirtualContestRules.play(plan.get().candles(), r.startBalance(), Map.of()).total();
		Instant at = now();
		tx.executeWithoutResult(t -> {
			if (db.settleRound(r.id(), end, hold, reason, at)) {
				db.applyRound(r.entryId(), r.board(), end, at);
				log.info("대회 판 정산 round={} reason={}", r.id(), reason);
			}
		});
	}

	// ───────── 하루 점수·주간 판정 ─────────

	/**
	 * 끝난 날(오늘 이전, 대회 마지막 날까지)의 하루 점수를 차례로 한 번씩 정한다. 그날 시작한 판이 진행 중이면 기다린다.
	 * 주의 마지막 날 점수를 정하면 그 주를 판정한다. 대회 마지막 날로 끝나는 4주차는 판정만 기록하고 판은 바꾸지 않는다(최종 순위는 그 주를 보낸 판).
	 */
	private void catchUp(EntryRow start) {
		EntryRow e = start;
		YearMonth m = YearMonth.parse(e.contestId());
		LocalDate last = m.atEndOfMonth();
		LocalDate today = today();
		LocalDate day = e.scoredThrough() == null ? LocalDate.ofInstant(e.joinedAt(), SEOUL) : e.scoredThrough().plusDays(1);
		while (day.isBefore(today) && !day.isAfter(last)) {
			LocalDate d = day;
			List<RoundRow> rounds = db.rounds(e.id(), d);
			if (rounds.stream().anyMatch(RoundRow::active)) {
				return;
			}
			// 기록용 시작·끝 잔액: 그날 첫 판의 시작 잔액과 마지막으로 끝난 판(같은 시각이면 나중에 시작한 판)의 끝 잔액. 점수는 유지 대비 초과 수익률 평균으로 정한다
			Long startBalance = rounds.isEmpty() ? null : rounds.getFirst().startBalance();
			Long endBalance = rounds.stream().max(Comparator.comparing(RoundRow::endedAt).thenComparingLong(RoundRow::id)).map(RoundRow::endBalance).orElse(null);
			BigDecimal rate = VirtualContestRules.dayRate(roundRates(rounds));
			// +100은 그날 10판을 모두 시작한 날만(끊긴 판 포함), 못 미치면 판 수와 상관없이 −100
			int points = VirtualContestRules.dailyPoints(rate, rounds.size());
			EntryRow before = e;
			Instant at = now();
			tx.executeWithoutResult(t -> {
				if (!db.advanceScored(before.id(), before.scoredThrough(), d, points)) {
					return;
				}
				db.insertDay(before.id(), d, before.board(), startBalance, endBalance, rate, points, at);
				if (d.equals(VirtualContestRules.weekEnd(d))) {
					LocalDate from = VirtualContestRules.weeks(m).get(VirtualContestRules.weekOf(d) - 1)[0];
					int week = db.sumPoints(before.id(), from, d);
					VirtualContestBoard next = VirtualContestRules.weekly(before.board(), week);
					if (db.insertWeek(before.id(), VirtualContestRules.weekOf(d), week, before.board(), next, at) && next != before.board() && !d.equals(last)) {
						VirtualContestBoard highest = next.ordinal() > before.highestBoard().ordinal() ? next : before.highestBoard();
						db.changeBoard(before.id(), before.board(), next, highest, week, at);
						log.info("대회 주간 판정 user={} from={} to={}", before.userId(), before.board(), next);
					}
				}
			});
			e = db.entry(e.id()).orElseThrow();
			day = day.plusDays(1);
		}
	}

	/** 정산된 판들의 초과 수익률. 유지 기준(hold_balance)이 생기기 전(V28 전)에 정산된 판은 비교 기준이 없어 뺀다 */
	private static List<BigDecimal> roundRates(List<RoundRow> rounds) {
		return rounds.stream()
			.filter(r -> r.endBalance() != null && r.holdBalance() != null)
			.map(r -> VirtualContestRules.excess(r.startBalance(), r.endBalance(), r.holdBalance()))
			.toList();
	}

	// ───────── 정리·정산 작업(1분마다, 켤 때도) ─────────

	/**
	 * 1분 정리·판정(결정 기록 5-5·6-2·7-6): 이번 달 대회 열기, 메모리에만 남은 세션 지우기, 세션이 없는 진행 중 판 정산(만료·재시작),
	 * 마감 지난 배치고사 채점, 끝난 날·주 판정, 마감한 대회 정산, 끝난 지 12개월 지난 대회 삭제
	 */
	public void tick() {
		locked(() -> {
			currentContest();
			sim.clean();
			Set<Long> live = sim.contestRounds();
			Set<Long> active = new HashSet<>();
			for (RoundRow r : db.activeRounds()) {
				active.add(r.id());
				if (!live.contains(r.id())) {
					settle(r, now().isBefore(r.expiresAt()) ? "RESTARTED" : "EXPIRED");
				}
			}
			// 탈퇴 등으로 판 기록이 없어진 세션은 지운다
			live.stream().filter(id -> !active.contains(id)).forEach(sim::dropContest);
			for (ContestRow c : db.openContests()) {
				if (now().isBefore(c.endsAt())) {
					db.expiredPlacements(c.id(), now()).stream().filter(p -> !discardLegacy(p)).forEach(p -> grade(p, Map.of()));
					db.entries(c.id()).forEach(this::catchUp);
				}
				else {
					settleContest(c.id());
				}
			}
			int removed = db.deleteEndedBefore(now().atZone(SEOUL).minusMonths(VirtualContestRules.RETENTION_MONTHS).toInstant());
			if (removed > 0) {
				log.info("보관 기간이 지난 대회 기록 삭제 {}건", removed);
			}
			return null;
		});
	}

	/**
	 * 월 정산(결정 기록 6-2·6-3): 진행 중 판을 모두 마감으로 정산하고, 마지막 날까지 하루 점수를 정한 뒤(마지막 주는 판정만 기록하고 판은 그대로)
	 * 참가자를 마지막 판별로 나눠 순위를 확정·저장하고 SETTLED로 바꾼다. 이미 정산했으면 아무것도 바꾸지 않는다(다시 돌려도 같다).
	 */
	void settleContest(String contestId) {
		locked(() -> {
			ContestRow c = db.contest(contestId).orElse(null);
			if (c == null || !c.open() || now().isBefore(c.endsAt())) {
				return null;
			}
			for (RoundRow r : db.activeRounds(contestId)) {
				sim.dropContest(r.id());
				settle(r, "CLOSED");
			}
			db.discardUngraded(contestId);
			db.entries(contestId).forEach(this::catchUp);
			tx.executeWithoutResult(t -> {
				for (VirtualContestBoard b : VirtualContestBoard.values()) {
					List<EntryRow> ranked = ranked(contestId, b);
					for (int i = 0; i < ranked.size(); i++) {
						db.saveFinal(ranked.get(i).id(), i + 1, ranked.size());
					}
				}
				db.markSettled(contestId, now());
			});
			log.info("대회 정산 contest={}", contestId);
			return null;
		});
	}

	// ───────── 랭킹·내 기록 ─────────

	/**
	 * 참가마다 지금 판의 평균 초과 수익률(랭킹 2순위). 지금 판에 들어온 뒤(참가 또는 마지막 승급·강등 뒤) 끝낸 판의 초과 수익률 평균이고, 끝낸 판이 없으면 null
	 */
	private Map<Long, BigDecimal> excessRates(String contestId, List<EntryRow> entries) {
		Map<Long, List<RoundRow>> byEntry = new HashMap<>();
		db.settledRounds(contestId).forEach(r -> byEntry.computeIfAbsent(r.entryId(), k -> new ArrayList<>()).add(r));
		Map<Long, BigDecimal> out = new HashMap<>();
		for (EntryRow e : entries) {
			Instant since = e.changedAt() != null ? e.changedAt() : e.joinedAt();
			List<RoundRow> mine = byEntry.getOrDefault(e.id(), List.of()).stream()
				.filter(r -> r.board() == e.board() && !r.startedAt().isBefore(since))
				.toList();
			out.put(e.id(), VirtualContestRules.dayRate(roundRates(mine)));
		}
		return out;
	}

	private static BigDecimal orZero(BigDecimal v) {
		return v == null ? BigDecimal.ZERO : v;
	}

	/** 판 안 순위(같은 순위 번호 없음). excess: 참가마다 평균 초과 수익률(없으면 0으로 본다) */
	private static List<EntryRow> ranked(List<EntryRow> entries, Map<Long, BigDecimal> excess) {
		Map<Long, EntryRow> byUser = new HashMap<>();
		entries.forEach(e -> byUser.put(e.userId(), e));
		return entries.stream()
			.map(e -> new Standing(e.userId(), e.boardPoints(), orZero(excess.get(e.id())), e.reachedAt(), e.joinedAt()))
			.sorted(VirtualContestRules.ORDER)
			.map(st -> byUser.get(st.userId()))
			.toList();
	}

	private List<EntryRow> ranked(String contestId, VirtualContestBoard board) {
		List<EntryRow> entries = db.entries(contestId, board);
		return ranked(entries, excessRates(contestId, entries));
	}

	private static RankingRow row(int rank, EntryRow e, BigDecimal excess, long userId) {
		long seed = e.board().seedMoney();
		return new RankingRow(rank, e.alias(), e.boardPoints(), excess, e.balance(), e.balance() - seed, VirtualContestRules.rate(e.balance(), seed), e.rounds(),
				e.liquidated(), e.userId() == userId);
	}

	public Ranking ranking(long userId, String contestId, VirtualContestBoard board) {
		return locked(() -> {
			if (contestId.equals(VirtualContestRules.contestId(YearMonth.from(now().atZone(SEOUL))))) {
				currentContest();
			}
			ContestRow c = db.contest(contestId).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
			List<RankingRow> rows = new ArrayList<>();
			List<EntryRow> entries = db.entries(contestId, board);
			Map<Long, BigDecimal> excess = excessRates(contestId, entries);
			int participants;
			if (c.open()) {
				List<EntryRow> ranked = ranked(entries, excess);
				for (int i = 0; i < ranked.size(); i++) {
					rows.add(row(i + 1, ranked.get(i), excess.get(ranked.get(i).id()), userId));
				}
				participants = ranked.size();
			}
			else {
				List<EntryRow> settled = entries.stream().filter(e -> e.finalRank() != null)
					.sorted((a, b) -> Integer.compare(a.finalRank(), b.finalRank())).toList();
				settled.forEach(e -> rows.add(row(e.finalRank(), e, excess.get(e.id()), userId)));
				participants = settled.stream().map(EntryRow::finalParticipants).findFirst().orElse(0);
			}
			RankingRow me = rows.stream().filter(RankingRow::isMe).findFirst().orElse(null);
			return new Ranking(contestId, board, c.open() ? "OPEN" : "SETTLED", participants,
					List.copyOf(rows.subList(0, Math.min(rows.size(), VirtualContestRules.RANKING_TOP))), me);
		});
	}

	/** 이번 대회 내 기록(배치고사·지금 판·판 점수·이번 주·오늘) */
	private Entry entry(EntryRow e) {
		LocalDate today = today();
		YearMonth m = YearMonth.parse(e.contestId());
		LocalDate day = today.isAfter(m.atEndOfMonth()) ? m.atEndOfMonth() : today.isBefore(m.atDay(1)) ? m.atDay(1) : today;
		int weekNo = VirtualContestRules.weekOf(day);
		LocalDate[] week = VirtualContestRules.weeks(m).get(weekNo - 1);
		List<RoundRow> rounds = db.rounds(e.id(), day);
		Long startBalance = rounds.isEmpty() ? null : rounds.getFirst().startBalance();
		// 지금까지 끝난 판들의 초과 수익률 평균(진행 중인 판은 빼고, 끝난 판이 없으면 null)
		BigDecimal todayRate = VirtualContestRules.dayRate(roundRates(rounds.stream().filter(r -> !r.active()).toList()));
		List<EntryRow> peers = db.entries(e.contestId(), e.board());
		Map<Long, BigDecimal> excess = excessRates(e.contestId(), peers);
		List<EntryRow> ranked = ranked(peers, excess);
		int rank = 1;
		for (int i = 0; i < ranked.size(); i++) {
			if (ranked.get(i).id() == e.id()) {
				rank = i + 1;
			}
		}
		long seed = e.board().seedMoney();
		BoardChange change = e.changeTo() == null ? null : new BoardChange(e.changeFrom(), e.changeTo(), e.changePoints(), format(e.changedAt()));
		return new Entry(e.contestId(), e.alias(), new PlacementSummary(e.placementCorrect(), e.placementBoard()), e.board(), seed, e.balance(),
				e.balance() - seed, VirtualContestRules.rate(e.balance(), seed), excess.get(e.id()), e.boardPoints(),
				new WeekProgress(weekNo, week[1].toString(), db.sumPoints(e.id(), week[0], week[1])),
				new Today(startBalance, todayRate, VirtualContestRules.DAILY_TARGET, rounds.size(),
						Math.max(0, VirtualContestRules.ROUNDS_PER_DAY - rounds.size())),
				rank, Math.max(1, ranked.size()), e.rounds(), db.activeRound(e.id()).isPresent(), e.liquidated(), change, format(e.joinedAt()),
				db.recentRounds(e.id(), RECENT_ROUNDS).stream().map(VirtualContestService::record).toList(),
				db.days(e.id()).stream().map(d -> new DayRecord(d.day().toString(), d.board(), db.countRounds(e.id(), d.day()), d.rate(), d.points())).toList());
	}

	/** 마지막 주 판정 결과. 이 규칙 전에 정산한 대회처럼 기록이 없으면 null */
	private FinalWeek finalWeek(long entryId) {
		return db.week(entryId, VirtualContestRules.WEEKS).map(w -> new FinalWeek(w.points(), VirtualContestRules.outcome(w.from(), w.to()))).orElse(null);
	}

	private static RoundRecord record(RoundRow r) {
		Long end = r.endBalance(), hold = r.holdBalance();
		return new RoundRecord(r.roundNumber(), r.board(), r.day().toString(), r.status(), r.endReason(), r.startBalance(), end, hold,
				end == null ? null : VirtualContestRules.rate(end, r.startBalance()), hold == null ? null : VirtualContestRules.rate(hold, r.startBalance()),
				end == null || hold == null ? null : VirtualContestRules.excess(r.startBalance(), end, hold), format(r.startedAt()), format(r.endedAt()));
	}

	public Mine mine(long userId) {
		return locked(() -> {
			ContestRow c = currentContest();
			Entry current = db.entry(c.id(), userId).map(e -> {
				catchUp(e);
				return entry(db.entry(e.id()).orElseThrow());
			}).orElse(null);
			List<VirtualContestDtos.Result> history = db.settledEntries(userId, HISTORY).stream()
				.filter(e -> e.finalRank() != null)
				.map(e -> {
					long seed = e.board().seedMoney();
					return new VirtualContestDtos.Result(e.contestId(), e.placementBoard(), e.board(), e.highestBoard(), e.boardPoints(), e.balance(),
							e.balance() - seed, VirtualContestRules.rate(e.balance(), seed), excessRates(e.contestId(), List.of(e)).get(e.id()), e.finalRank(),
							e.finalParticipants(), e.rounds(), e.liquidated(), finalWeek(e.id()));
				})
				.toList();
			return new Mine(db.alias(userId).orElse(null), current, history);
		});
	}
}
