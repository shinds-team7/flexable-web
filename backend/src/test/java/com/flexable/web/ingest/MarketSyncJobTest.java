package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.market.Board;
import com.flexable.web.market.MarketService;

/** worker 프로필 + 가짜 소스(테스트 설정)로 수집 한 번을 돌려 DB에 쌓이는지 본다. 외부 호출 없음. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:worker;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class MarketSyncJobTest {

	@Autowired
	MarketSyncJob job;

	@Autowired
	MarketService market;

	@Autowired
	IngestRunRepository runs;

	@Test
	void 목록과_일봉을_모으고_두_번째는_최근_구간만_다시_받는다() {
		MarketSyncJob.Result first = job.runOnce();
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(first.instruments()).isEqualTo(9); // 가짜 목록: 코스피 4·코스닥 2·ETF 3
		assertThat(market.board(Board.KOSPI).items().getFirst().id()).isEqualTo("005930");
		assertThat(market.latestTradeDate("005930")).isPresent();
		LocalDate earliest = market.earliestTradeDate("005930").orElseThrow();
		assertThat(earliest).isBefore(LocalDate.now().minusYears(4)); // backfill 5년

		MarketSyncJob.Result second = job.runOnce();
		assertThat(second.rows()).isLessThan(first.rows() / 10); // 최근 recheckDays만
		assertThat(runs.findFirstByJobOrderByIdDesc(MarketSyncJob.JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");
	}
}
