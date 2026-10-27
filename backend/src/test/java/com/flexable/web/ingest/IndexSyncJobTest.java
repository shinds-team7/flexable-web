package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.market.Board;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos;
import com.flexable.web.market.MarketInsightService;

/** worker 프로필 + 가짜 소스로 시장 띠(코스피·코스닥)와 업종을 모아 조회에 보이는지 본다. 외부 호출 없음. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:worker-index;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class IndexSyncJobTest {

	@Autowired
	MarketSyncJob marketJob;
	@Autowired
	IndexSyncJob indexJob;
	@Autowired
	PracticeSyncJob practiceJob;
	@Autowired
	MarketInsightService insight;
	@Autowired
	IngestRunRepository runs;

	@Test
	void 시장_띠와_업종을_모으고_가짜_소스는_예시로_표시한다() {
		assertThat(insight.indices().items()).isEmpty(); // 수집 전 칸은 빠진다

		MarketSyncJob.Result r = indexJob.runOnce();
		assertThat(r.status()).isEqualTo("SUCCESS");
		assertThat(r.instruments()).isEqualTo(2);
		assertThat(runs.findFirstByJobOrderByIdDesc(IndexSyncJob.JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");
		var strip = insight.indices();
		assertThat(strip.items()).extracting(InsightDtos.IndexItem::key).containsExactly(IndexKey.KOSPI, IndexKey.KOSDAQ);
		assertThat(strip.isSample()).isTrue();
		// 두 번째는 마지막 거래일 recheckDays 전부터만 다시 받는다
		assertThat(indexJob.runOnce().rows()).isLessThan(r.rows());

		marketJob.runOnce();
		practiceJob.runOnce();
		var kospi = insight.industries(Board.KOSPI, 5);
		// 가짜 목록: 전기전자(삼성전자 900 + SK하이닉스 800), 금융업(KB금융 400), 서비스업(NAVER 300)
		assertThat(kospi.items()).extracting(InsightDtos.IndustryItem::categoryName).containsExactly("전기전자", "금융업", "서비스업");
		assertThat(kospi.isSample()).isTrue();
		assertThat(insight.industries(Board.KOSDAQ, 5).items()).hasSize(2);
	}
}
