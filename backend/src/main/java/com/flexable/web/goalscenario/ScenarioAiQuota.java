package com.flexable.web.goalscenario;

import java.sql.Timestamp;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;
import java.util.Optional;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.flexable.web.common.ApiException;
import com.flexable.web.user.UserService;
import com.flexable.web.user.UserWithdrawalListener;

import tools.jackson.core.type.TypeReference;
import tools.jackson.databind.json.JsonMapper;

/**
 * 목표 시나리오 AI 조합의 횟수와 재사용(policies §7-6). DB 조건부 증가가 비용 상한의 최종 방어다. 예약 트랜잭션은 HTTP 전에 끝낸다.
 * 날짜는 한국 시간(KST) 기준이다.
 */
@Service
class ScenarioAiQuota implements UserWithdrawalListener {
	static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final JsonMapper JSON = JsonMapper.builder().build();

	enum Reserve { OK, LIMIT, GONE }

	/** 회원 요금제. 하루 한도를 고른다(무료 5회·플러스 10회). */
	enum Plan { FREE, PLUS }

	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;
	private final UserService users;
	private final Clock clock;
	private final GoalScenarioAiProperties props;

	ScenarioAiQuota(JdbcTemplate jdbc, PlatformTransactionManager manager, UserService users, Clock clock, GoalScenarioAiProperties props) {
		this.jdbc = jdbc;
		this.tx = new TransactionTemplate(manager);
		this.users = users;
		this.clock = clock;
		this.props = props;
	}

	/**
	 * 회원의 요금제. 플러스는 아직 모의 결제라 서버에 구독 정보가 없어 모든 회원을 무료로 본다(policies §7-6).
	 * 실결제(billing)가 붙으면 여기서 구독 상태를 읽는다.
	 */
	Plan plan(long userId) {
		return Plan.FREE;
	}

	int limitPerDay(long userId) {
		return props.dailyLimit(plan(userId));
	}

	/**
	 * 회원 하루 1회를 예약한다(#431). 요청 중에는 AI를 부르지 않아 서비스 전체 횟수는 세지 않는다(전체 상한은 worker의 미리 만들기에만 쓴다).
	 */
	Reserve reserve(long userId) {
		return tx.execute(ignored -> {
			// 탈퇴와 같은 순서(회원 → 횟수)로 잠근다. 탈퇴 후 사용 행을 다시 만들지 않는다.
			try {
				users.lockForUpdate(userId);
			}
			catch (ApiException e) {
				return Reserve.GONE;
			}
			LocalDate day = today();
			jdbc.update("INSERT INTO goal_scenario_ai_usage (usage_date, user_id, count) VALUES (?, ?, 0) "
					+ "ON DUPLICATE KEY UPDATE count = count", day, userId);
			if (jdbc.update("UPDATE goal_scenario_ai_usage SET count = count + 1 WHERE usage_date = ? AND user_id = ? AND count < ?",
					day, userId, limitPerDay(userId)) == 0) {
				return Reserve.LIMIT;
			}
			return Reserve.OK;
		});
	}

	/**
	 * 회원 몫 없이 서비스 전체 1회만 예약한다(미리 만드는 유형 해설, #417). 전체 상한에 걸리면 false.
	 * 결과를 못 받아도 되돌리지 않는다(비용 상한).
	 */
	boolean reserveService() {
		LocalDate day = today();
		return tx.execute(ignored -> {
			jdbc.update("INSERT INTO goal_scenario_ai_daily (usage_date, count) VALUES (?, 0) ON DUPLICATE KEY UPDATE count = count", day);
			return jdbc.update("UPDATE goal_scenario_ai_daily SET count = count + 1 WHERE usage_date = ? AND count < ?", day, props.dailyCap()) > 0;
		});
	}

	int remaining(long userId) {
		Integer used = jdbc.query("SELECT count FROM goal_scenario_ai_usage WHERE usage_date = ? AND user_id = ?",
				rs -> rs.next() ? rs.getInt(1) : 0, today(), userId);
		return Math.max(0, limitPerDay(userId) - used);
	}

	/** 같은 회원·같은 조건(시작 금액·월 금액·기한·목표 금액·자료 기준일·프롬프트 버전)으로 이미 받은 AI 조합(#431). 목표가 없으면 칸에 0을 둔다. */
	record Key(long userId, long startAmount, long monthlyBudget, int months, Long targetAmount, LocalDate asOf, String promptVersion) {
		Object[] args() {
			return new Object[] { userId, startAmount, monthlyBudget, months, targetAmount == null ? 0 : targetAmount, asOf, promptVersion };
		}
	}

	private static final String WHERE = " WHERE user_id = ? AND start_amount = ? AND monthly_budget = ? AND months = ? AND target_amount = ? AND as_of = ?"
			+ " AND prompt_version = ?";

	Optional<List<Proposals.Draft>> cached(Key key) {
		List<String> rows = jdbc.queryForList("SELECT drafts FROM goal_scenario_ai_cache" + WHERE, String.class, key.args());
		if (rows.isEmpty()) {
			return Optional.empty();
		}
		try {
			return Optional.of(JSON.readValue(rows.getFirst(), new TypeReference<List<Proposals.Draft>>() { }));
		}
		catch (RuntimeException e) {
			return Optional.empty();
		}
	}

	/** 보여 준 AI 조합을 저장한다. 같은 조건으로 동시에 저장하면 먼저 들어간 것을 둔다. */
	void cache(Key key, List<Proposals.Draft> drafts, String model) {
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, start_amount, monthly_budget, months, target_amount, as_of, prompt_version, drafts, model,"
				+ " created_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = user_id", key.userId(), key.startAmount(),
				key.monthlyBudget(), key.months(), key.targetAmount() == null ? 0 : key.targetAmount(), key.asOf(), key.promptVersion(),
				JSON.writeValueAsString(drafts), model, Timestamp.from(clock.instant()));
	}

	LocalDate today() {
		return LocalDate.ofInstant(clock.instant(), SEOUL);
	}

	/** 방침 제4조: 날짜에서 7일이 지난 회원별 횟수와 재사용 조합을 지운다. 전체 카운터는 남긴다. */
	int deleteExpired() {
		LocalDate before = today().minusDays(7);
		return jdbc.update("DELETE FROM goal_scenario_ai_usage WHERE usage_date <= ?", before)
				+ jdbc.update("DELETE FROM goal_scenario_ai_cache WHERE as_of <= ?", before);
	}

	@Override
	public void onWithdraw(long userId) {
		jdbc.update("DELETE FROM goal_scenario_ai_usage WHERE user_id = ?", userId);
		jdbc.update("DELETE FROM goal_scenario_ai_cache WHERE user_id = ?", userId);
	}
}
