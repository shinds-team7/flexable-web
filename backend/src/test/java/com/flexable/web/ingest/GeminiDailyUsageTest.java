package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.transaction.PlatformTransactionManager;

/** Gemini 하루 호출 수: 상한에서 멈추고, 다시 켜도(새 인스턴스) 그날 센 수가 남고, KST 날이 바뀌면 다시 센다. 외부 호출 없음. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
		properties = "spring.datasource.url=jdbc:h2:mem:gemini-usage;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class GeminiDailyUsageTest {

	@Autowired
	JdbcTemplate jdbc;
	@Autowired
	PlatformTransactionManager tx;

	private GeminiDailyUsage at(String instant) {
		return new GeminiDailyUsage(jdbc, tx, Clock.fixed(Instant.parse(instant), ZoneOffset.UTC));
	}

	@Test
	void 하루_상한에서_멈추고_다시_켜도_센_수가_남는다() {
		// 2026-10-30 23:30 KST
		GeminiDailyUsage first = at("2026-10-30T14:30:00Z");
		assertThat(first.take("event-overview", 2)).isTrue();
		assertThat(first.take("event-overview", 2)).isTrue();
		assertThat(first.take("event-overview", 2)).isFalse();
		assertThat(first.used("event-overview")).isEqualTo(2);

		// worker를 다시 켠 것과 같다: 같은 날이면 상한에 닿아 있다. 상한을 올리면 그만큼 더 부를 수 있다
		GeminiDailyUsage restarted = at("2026-10-30T14:45:00Z");
		assertThat(restarted.take("event-overview", 2)).isFalse();
		assertThat(restarted.take("event-overview", 3)).isTrue();
		assertThat(restarted.used("event-overview")).isEqualTo(3);
		assertThat(restarted.take("youth-summary", 2)).isTrue(); // 용도마다 따로 센다

		// 2026-10-31 00:10 KST: KST 날이 바뀌면 다시 센다
		GeminiDailyUsage nextDay = at("2026-10-30T15:10:00Z");
		assertThat(nextDay.used("event-overview")).isZero();
		assertThat(nextDay.take("event-overview", 2)).isTrue();
	}
}
