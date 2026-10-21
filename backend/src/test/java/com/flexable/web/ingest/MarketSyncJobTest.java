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
	void 예전_규칙으로_받아_앞부분이_빈_종목만_다시_채운다() {
		LocalDate today = LocalDate.of(2026, 10, 21);
		assertThat(MarketSyncJob.backfillFrom(today, 5)).isEqualTo(LocalDate.of(2021, 9, 24));
		assertThat(MarketSyncJob.needsHeadFill(LocalDate.of(2021, 10, 21), today, 5)).isTrue(); // 정확히 5년 전부터 받은 DB
		assertThat(MarketSyncJob.needsHeadFill(LocalDate.of(2021, 9, 24), today, 5)).isFalse(); // 이미 채움
		assertThat(MarketSyncJob.needsHeadFill(LocalDate.of(2023, 3, 2), today, 5)).isFalse(); // 늦게 상장
		assertThat(MarketSyncJob.needsHeadFill(null, today, 5)).isFalse();
	}

	@Test
	void 목록과_일봉을_모으고_두_번째는_최근_구간만_다시_받는다() {
		MarketSyncJob.Result first = job.runOnce();
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(first.instruments()).isEqualTo(9); // 가짜 목록: 코스피 4·코스닥 2·ETF 3
		assertThat(market.board(Board.KOSPI).items().getFirst().id()).isEqualTo("005930");
		assertThat(market.latestTradeDate("005930")).isPresent();
		LocalDate earliest = market.earliestTradeDate("005930").orElseThrow();
		// backfill 5년: 화면 "5년 전"(그 달 1일)부터 계산되게 그 달 1일보다 앞부터 받는다
		assertThat(earliest).isBefore(LocalDate.now().minusYears(5).withDayOfMonth(1));

		MarketSyncJob.Result second = job.runOnce();
		assertThat(second.rows()).isLessThan(first.rows() / 10); // 최근 recheckDays만
		assertThat(runs.findFirstByJobOrderByIdDesc(MarketSyncJob.JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");
	}
}
