package com.flexable.web.engagement;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;

import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Service;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.user.UserService;

/** DB 조건부 증가가 비용 상한의 최종 방어다. 예약 트랜잭션은 HTTP를 보내기 전에 끝낸다. */
@Service
public class GoalCoachQuota {
	static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;
	private final UserService users;
	private final Clock clock;
	private final GoalCoachProperties props;

	public GoalCoachQuota(JdbcTemplate jdbc, PlatformTransactionManager manager, UserService users, Clock clock,
			GoalCoachProperties props) {
		this.jdbc = jdbc;
		this.tx = new TransactionTemplate(manager);
		this.users = users;
		this.clock = clock;
		this.props = props;
	}

	boolean reserve(long userId) {
		return Boolean.TRUE.equals(tx.execute(ignored -> {
			// 탈퇴와 같은 순서(회원 → 목표/횟수)로 잠근다. 탈퇴 후 사용 행을 다시 만들지 않는다.
			try {
				users.lockForUpdate(userId);
			}
			catch (ApiException e) {
				throw new ApiException(ErrorCode.GOAL_CHANGED);
			}
			LocalDate day = today();
			jdbc.update("INSERT INTO goal_coach_usage (usage_date, user_id, count) VALUES (?, ?, 0) "
					+ "ON DUPLICATE KEY UPDATE count = count", day, userId);
			int reserved = jdbc.update("UPDATE goal_coach_usage SET count = count + 1 "
					+ "WHERE usage_date = ? AND user_id = ? AND count < ?", day, userId, props.freeDailyLimit());
			if (reserved == 0) {
				long seconds = Math.max(1, Duration.between(clock.instant(), day.plusDays(1).atStartOfDay(SEOUL).toInstant()).getSeconds());
				throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, "오늘 무료 횟수를 다 썼어요",
						Map.of("retryAfterSeconds", seconds, "plan", "FREE", "limitPerDay", props.freeDailyLimit()));
			}
			jdbc.update("INSERT INTO ai_daily_usage (usage_date, count) VALUES (?, 0) ON DUPLICATE KEY UPDATE count = count", day);
			if (jdbc.update("UPDATE ai_daily_usage SET count = count + 1 WHERE usage_date = ? AND count < ?",
					day, props.dailyCap()) == 0) {
				jdbc.update("UPDATE goal_coach_usage SET count = count - 1 WHERE usage_date = ? AND user_id = ?", day, userId);
				return false;
			}
			return true;
		}));
	}

	int remaining(long userId) {
		Integer used = jdbc.query("SELECT count FROM goal_coach_usage WHERE usage_date = ? AND user_id = ?",
				rs -> rs.next() ? rs.getInt(1) : 0, today(), userId);
		return Math.max(0, props.freeDailyLimit() - used);
	}

	LocalDate today() {
		return LocalDate.ofInstant(clock.instant(), SEOUL);
	}

	/** 방침 제4조: KST 사용 날짜에서 7일이 지난 회원별 횟수만 지운다. 전체 카운터는 남긴다. */
	int deleteExpiredUsage() {
		return jdbc.update("DELETE FROM goal_coach_usage WHERE usage_date <= ?", today().minusDays(7));
	}

	void deleteForUser(long userId) {
		jdbc.update("DELETE FROM goal_coach_usage WHERE user_id = ?", userId);
	}
}
