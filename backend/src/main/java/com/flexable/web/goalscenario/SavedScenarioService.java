package com.flexable.web.goalscenario;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.ZoneId;
import java.time.temporal.ChronoUnit;
import java.util.List;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.goalscenario.GoalScenarioDtos.Product;
import com.flexable.web.goalscenario.GoalScenarioDtos.Result;
import com.flexable.web.goalscenario.GoalScenarioDtos.Saved;
import com.flexable.web.goalscenario.GoalScenarioDtos.SavedList;
import com.flexable.web.goalscenario.GoalScenarioDtos.SavedSummary;
import com.flexable.web.goalscenario.GoalScenarioDtos.Scenario;
import com.flexable.web.user.UserWithdrawalListener;

import tools.jackson.databind.json.JsonMapper;

/**
 * 회원이 저장한 목표 시나리오(policies §7-8). 방금 계산한 결과(resultId)의 플랜 전체를 그때 값 그대로 저장하고, 다시 계산하지 않는다.
 * 회원당 최대 5개, 지우거나 탈퇴하면 삭제한다.
 */
@Service
public class SavedScenarioService implements UserWithdrawalListener {

	static final int LIMIT = 5;
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final JsonMapper JSON = JsonMapper.builder().build();

	/** snapshot 칸에 넣는 JSON. 목록·상세에 필요한 값을 모두 담는다. scenario는 고른 플랜, alternatives는 나머지 플랜이고 예전 저장본에는 없다(null). */
	record Snapshot(int months, String proposer, String asOf, String returnsFrom, String returnsTo, int paths, BigDecimal reachShare,
			List<Product> products, Scenario scenario, List<Scenario> alternatives, List<String> assumptions, String notice, boolean isSample) {
	}

	private final SavedScenarioRepository saved;
	private final ScenarioResultCache results;
	private final Clock clock;

	SavedScenarioService(SavedScenarioRepository saved, ScenarioResultCache results, Clock clock) {
		this.saved = saved;
		this.results = results;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	SavedList list(long userId) {
		return new SavedList(saved.findByUserIdOrderBySavedAtDescIdDesc(userId).stream().map(SavedScenarioService::summary).toList(), LIMIT);
	}

	@Transactional(readOnly = true)
	Saved get(long userId, long id) {
		return saved.findByIdAndUserId(id, userId).map(SavedScenarioService::detail).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
	}

	@Transactional
	Saved save(long userId, GoalScenarioDtos.SaveRequest req) {
		if (req == null || req.resultId() == null || req.resultId().isBlank()) {
			throw ApiException.invalid("resultId", "저장할 계산 결과를 골라 주세요");
		}
		if (req.scenarioId() == null || req.scenarioId().isBlank()) {
			throw ApiException.invalid("scenarioId", "저장할 시나리오를 골라 주세요");
		}
		Result r = results.find(req.resultId()).orElseThrow(() -> new ApiException(ErrorCode.GOAL_SCENARIO_EXPIRED));
		Scenario s = r.scenarios().stream().filter(x -> x.id().equals(req.scenarioId())).findFirst()
			.orElseThrow(() -> ApiException.invalid("scenarioId", "이 계산 결과에 없는 시나리오예요"));
		if (saved.countByUserId(userId) >= LIMIT) {
			throw new ApiException(ErrorCode.GOAL_SCENARIO_LIMIT);
		}
		// 결과 문장은 저장하지 않고 조회할 때 저장된 숫자로 만든다(policies §7-8)
		Snapshot snap = new Snapshot(r.months(), r.proposer(), r.asOf().toString(), r.returnsFrom(), r.returnsTo(), r.paths(), r.reachShare(),
				r.products(), s.withResultText(null), r.scenarios().stream().filter(x -> !x.id().equals(s.id())).map(x -> x.withResultText(null)).toList(),
				r.assumptions(), r.notice(), r.isSample());
		Instant now = clock.instant().truncatedTo(ChronoUnit.MICROS); // DB(DATETIME(6))와 같은 정밀도로 돌려준다
		SavedScenario row = saved.save(new SavedScenario(userId, now, r.name(), r.targetAmount(), r.months(), JSON.writeValueAsString(snap)));
		// 동시에 저장해 5개를 넘겼으면 이번 저장을 되돌린다
		if (saved.countByUserId(userId) > LIMIT) {
			throw new ApiException(ErrorCode.GOAL_SCENARIO_LIMIT);
		}
		return detail(row);
	}

	@Transactional
	void delete(long userId, long id) {
		SavedScenario row = saved.findByIdAndUserId(id, userId).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND));
		saved.delete(row);
	}

	@Override
	public void onWithdraw(long userId) {
		saved.deleteByUserId(userId);
	}

	/** 적금 만기가 없는 예전 저장본은 만기 = 기한으로 읽는다(그때는 만기와 기한이 같은 적금만 골랐다). */
	private static List<Product> products(Snapshot s) {
		return s.products().stream()
			.map(p -> p.type() == ProductType.SAVINGS && p.termMonths() == null
					? new Product(p.type(), p.items(), p.ratePercent(), p.isSample(), p.alternatives(), s.months())
					: p)
			.toList();
	}

	private static Snapshot read(SavedScenario row) {
		return JSON.readValue(row.getSnapshot(), Snapshot.class);
	}

	private static OffsetDateTime at(Instant i) {
		return i.atZone(SEOUL).toOffsetDateTime();
	}

	private static SavedSummary summary(SavedScenario row) {
		Snapshot s = read(row);
		return new SavedSummary(row.getId(), at(row.getSavedAt()), row.getName(), row.getTargetAmount(), row.getMonths(), LocalDate.parse(s.asOf()),
				s.scenario().title(), s.scenario().reachable(), s.scenario().monthly(),
				s.scenario().outcome() == null ? null : s.scenario().outcome().kind());
	}

	private static Saved detail(SavedScenario row) {
		Snapshot s = read(row);
		return new Saved(row.getId(), at(row.getSavedAt()), row.getName(), row.getTargetAmount(), row.getMonths(), s.proposer(),
				LocalDate.parse(s.asOf()), s.returnsFrom(), s.returnsTo(), s.paths(), s.reachShare(), products(s), withText(s.scenario(), s.months()),
				s.alternatives() == null ? List.of() : s.alternatives().stream().map(x -> withText(x, s.months())).toList(), s.assumptions(), s.notice(),
				s.isSample());
	}

	/** 저장된 월 금액·결과로 결과 문장을 만든다(옛 저장본 포함, policies §7-5). 옛 저장본의 explanationParts는 없어 null로 읽힌다. */
	private static Scenario withText(Scenario x, int months) {
		return x.withResultText(ScenarioResultText.of(x.reachable(), x.monthly(), x.outcome(), months));
	}
}
