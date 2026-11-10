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

	enum Reserve { OK, LIMIT, DAILY_CAP, GONE }

	/** 회원 요금제. 하루 한도를 고른다(무료 3회·플러스 10회). */
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

	/** 회원 1회와 서비스 전체 1회를 함께 예약한다. 전체 상한에 걸리면 회원 몫은 되돌린다. */
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
			int limit = limitPerDay(userId);
			jdbc.update("INSERT INTO goal_scenario_ai_usage (usage_date, user_id, count) VALUES (?, ?, 0) "
					+ "ON DUPLICATE KEY UPDATE count = count", day, userId);
			if (jdbc.update("UPDATE goal_scenario_ai_usage SET count = count + 1 WHERE usage_date = ? AND user_id = ? AND count < ?",
					day, userId, limit) == 0) {
				return Reserve.LIMIT;
			}
			jdbc.update("INSERT INTO goal_scenario_ai_daily (usage_date, count) VALUES (?, 0) ON DUPLICATE KEY UPDATE count = count", day);
			if (jdbc.update("UPDATE goal_scenario_ai_daily SET count = count + 1 WHERE usage_date = ? AND count < ?", day,
					props.dailyCap()) == 0) {
				jdbc.update("UPDATE goal_scenario_ai_usage SET count = count - 1 WHERE usage_date = ? AND user_id = ?", day, userId);
				return Reserve.DAILY_CAP;
			}
			return Reserve.OK;
		});
	}

	/** AI가 결과를 주지 못했을 때(호출 실패·규칙 위반) 회원 몫 1회를 되돌린다. 서비스 전체 횟수는 비용 상한이라 되돌리지 않는다. */
	void refund(long userId) {
		jdbc.update("UPDATE goal_scenario_ai_usage SET count = count - 1 WHERE usage_date = ? AND user_id = ? AND count > 0", today(), userId);
	}

	int remaining(long userId) {
		Integer used = jdbc.query("SELECT count FROM goal_scenario_ai_usage WHERE usage_date = ? AND user_id = ?",
				rs -> rs.next() ? rs.getInt(1) : 0, today(), userId);
		return Math.max(0, limitPerDay(userId) - used);
	}

	/** 같은 회원이 같은 목표 금액·기한(개월)·자료 기준일로 받은 AI 초안. */
	Optional<List<Proposals.Draft>> cached(long userId, long targetAmount, int months, LocalDate asOf) {
		List<String> rows = jdbc.queryForList(
				"SELECT drafts FROM goal_scenario_ai_cache WHERE user_id = ? AND target_amount = ? AND months = ? AND as_of = ?", String.class,
				userId, targetAmount, months, asOf);
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

	/** 검증을 통과한 AI 초안만 저장한다. 동시에 저장하면 먼저 들어간 것을 둔다. */
	void cache(long userId, long targetAmount, int months, LocalDate asOf, List<Proposals.Draft> drafts, String model) {
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, as_of, drafts, model, created_at) VALUES (?, ?, ?, ?, ?, ?, ?) "
				+ "ON DUPLICATE KEY UPDATE user_id = user_id", userId, targetAmount, months, asOf, JSON.writeValueAsString(drafts), model,
				Timestamp.from(clock.instant()));
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
