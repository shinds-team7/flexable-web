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

	/** AI가 결과를 주지 못했을 때(호출 실패·규칙 위반) 회원 몫 1회를 되돌린다. 서비스 전체 횟수는 비용 상한이라 되돌리지 않는다. */
	void refund(long userId) {
		jdbc.update("UPDATE goal_scenario_ai_usage SET count = count - 1 WHERE usage_date = ? AND user_id = ? AND count > 0", today(), userId);
	}

	int remaining(long userId) {
		Integer used = jdbc.query("SELECT count FROM goal_scenario_ai_usage WHERE usage_date = ? AND user_id = ?",
				rs -> rs.next() ? rs.getInt(1) : 0, today(), userId);
		return Math.max(0, limitPerDay(userId) - used);
	}

	/**
	 * 같은 회원이 같은 목표 금액·기한(개월)·월 납입 가능액·자료 기준일로 받은 AI 초안. 가능액이 없으면 칸에 0을 두고 0끼리 같은 조건으로 본다
	 * (V37 전에 저장된 조합도 0이다).
	 */
	Optional<List<Proposals.Draft>> cached(long userId, long targetAmount, int months, Long monthlyBudget, LocalDate asOf, String promptVersion) {
		return cached(userId, targetAmount, months, monthlyBudget, asOf, List.of(promptVersion));
	}

	/** promptVersions 중 하나로 만든 조합만 다시 쓴다(유형 해설을 미리 만든 짧은 길과 긴 길, #417). */
	Optional<List<Proposals.Draft>> cached(long userId, long targetAmount, int months, Long monthlyBudget, LocalDate asOf,
			List<String> promptVersions) {
		// 프롬프트 버전이 다른 조합(V38 전 조합은 null)은 다시 쓰지 않는다(#406)
		List<Object> args = new java.util.ArrayList<>(List.of(userId, targetAmount, months, budgetKey(monthlyBudget), asOf));
		args.addAll(promptVersions);
		List<String> rows = jdbc.queryForList(
				"SELECT drafts FROM goal_scenario_ai_cache WHERE user_id = ? AND target_amount = ? AND months = ? AND monthly_budget = ? AND as_of = ?"
						+ " AND prompt_version IN (" + String.join(", ", java.util.Collections.nCopies(promptVersions.size(), "?")) + ")",
				String.class, args.toArray());
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

	/**
	 * 검증을 통과한 AI 초안만 저장한다. 같은 조건에 다른 프롬프트 버전(또는 버전 없는 옛 행)이 있으면 새 초안으로 덮어쓴다(#406).
	 * 같은 버전끼리 동시에 저장하면 먼저 들어간 것을 둔다.
	 */
	void cache(long userId, long targetAmount, int months, Long monthlyBudget, LocalDate asOf, List<Proposals.Draft> drafts, String model,
			String promptVersion) {
		String json = JSON.writeValueAsString(drafts);
		Timestamp now = Timestamp.from(clock.instant());
		int replaced = jdbc.update("UPDATE goal_scenario_ai_cache SET drafts = ?, model = ?, prompt_version = ?, created_at = ?"
				+ " WHERE user_id = ? AND target_amount = ? AND months = ? AND monthly_budget = ? AND as_of = ?"
				+ " AND (prompt_version IS NULL OR prompt_version <> ?)",
				json, model, promptVersion, now, userId, targetAmount, months, budgetKey(monthlyBudget), asOf, promptVersion);
		if (replaced == 0) {
			jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, monthly_budget, as_of, drafts, model, prompt_version, created_at) "
					+ "VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?) ON DUPLICATE KEY UPDATE user_id = user_id", userId, targetAmount, months, budgetKey(monthlyBudget),
					asOf, json, model, promptVersion, now);
		}
	}

	/** 기본 키 칸이라 null을 둘 수 없어 가능액이 없으면 0으로 둔다(가능액은 1만 원 이상이라 겹치지 않는다). */
	private static long budgetKey(Long monthlyBudget) {
		return monthlyBudget == null ? 0 : monthlyBudget;
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
