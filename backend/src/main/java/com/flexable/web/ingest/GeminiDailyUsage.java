package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;

import org.springframework.context.annotation.Profile;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.stereotype.Component;
import org.springframework.transaction.PlatformTransactionManager;
import org.springframework.transaction.support.TransactionTemplate;

/**
 * worker의 Gemini 하루(KST) 호출 수(gemini_daily_usage). 부르기 전에 DB에서 조건부로 하나 늘려 하루 상한을 지킨다.
 * 메모리가 아니라 DB에 세므로 worker를 다시 켜도 그날 쓴 수가 남는다(GoalCoachQuota와 같은 방식).
 */
@Component
@Profile("worker")
public class GeminiDailyUsage {

	private final JdbcTemplate jdbc;
	private final TransactionTemplate tx;
	private final Clock clock;

	public GeminiDailyUsage(JdbcTemplate jdbc, PlatformTransactionManager manager, Clock clock) {
		this.jdbc = jdbc;
		this.tx = new TransactionTemplate(manager);
		this.clock = clock;
	}

	/** 오늘 한 번 더 불러도 되면 세고 true. 상한에 닿았으면 세지 않고 false. */
	public boolean take(String purpose, int dailyCap) {
		return Boolean.TRUE.equals(tx.execute(ignored -> {
			LocalDate day = today();
			jdbc.update("INSERT INTO gemini_daily_usage (usage_date, purpose, count) VALUES (?, ?, 0) ON DUPLICATE KEY UPDATE count = count",
					day, purpose);
			return jdbc.update("UPDATE gemini_daily_usage SET count = count + 1 WHERE usage_date = ? AND purpose = ? AND count < ?", day, purpose,
					dailyCap) == 1;
		}));
	}

	/** 오늘 센 호출 수. */
	public int used(String purpose) {
		Integer n = jdbc.query("SELECT count FROM gemini_daily_usage WHERE usage_date = ? AND purpose = ?", rs -> rs.next() ? rs.getInt(1) : 0,
				today(), purpose);
		return n == null ? 0 : n;
	}

	private LocalDate today() {
		return LocalDate.now(clock.withZone(IngestConfig.SEOUL));
	}
}
