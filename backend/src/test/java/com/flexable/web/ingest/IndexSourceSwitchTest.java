package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.ingest.fake.FakeIndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexItem;
import com.flexable.web.market.InsightDtos.IndexValue;
import com.flexable.web.market.MarketInsightService;

/** 같은 DB에서 가짜 → 실제 소스로 바꿀 때: 두 제공처 값을 섞어 전일 대비를 내지 않고, 소스가 없는 칸의 가짜 값은 지운다. 외부 호출 없음. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
		properties = "spring.datasource.url=jdbc:h2:mem:worker-index-switch;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class IndexSourceSwitchTest {

	/** 수요일. 가짜 소스는 화요일(10-27) 값도 넣지만 실제 소스는 그날을 휴장으로 보고 월·수 값만 준다. */
	static final LocalDate TODAY = LocalDate.of(2026, 10, 28);

	@Autowired
	MarketInsightService insight;
	@Autowired
	IngestProperties props;
	@Autowired
	IngestRunRepository runs;

	/** 월요일·오늘 두 날 값을 주고, 마지막으로 받은 시작일을 기억한다. */
	static final class Real implements IndexSource {
		private final String name;
		private final Set<IndexKey> keys;
		LocalDate lastFrom;

		Real(String name, Set<IndexKey> keys) {
			this.name = name;
			this.keys = keys;
		}

		@Override
		public String source() {
			return name;
		}

		@Override
		public Set<IndexKey> keys() {
			return keys;
		}

		@Override
		public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
			lastFrom = from;
			return List.of(new IndexValue(to.minusDays(2), new BigDecimal("2500.00")), new IndexValue(to, new BigDecimal("2550.00")));
		}
	}

	@Test
	void 가짜에서_실제로_바꾸면_가짜_값을_지우고_실제_값끼리만_비교한다() {
		Clock clock = Clock.fixed(TODAY.atTime(9, 0).toInstant(ZoneOffset.ofHours(9)), ZoneOffset.UTC);
		new IndexSyncJob(List.of(new FakeIndexSource()), insight, props, runs, clock).runOnce();
		assertThat(insight.indices().items()).hasSize(IndexKey.values().length);
		assertThat(insight.indices().isSample()).isTrue();
		// 채권지수는 실제 제공처 값이 이미 있어 소스가 없어도 마지막 성공 값으로 남는다
		insight.saveIndex(IndexKey.KRXBOND, List.of(new IndexValue(TODAY.minusDays(1), new BigDecimal("190.00")),
				new IndexValue(TODAY, new BigDecimal("191.00"))), "한국거래소");

		Real kiwoom = new Real("키움증권", Set.of(IndexKey.KOSPI));
		MarketSyncJob.Result r = new IndexSyncJob(List.of(kiwoom), insight, props, runs, clock).runOnce();

		assertThat(r.status()).isEqualTo("SUCCESS");
		// 새 소스는 처음이라 가짜 소스의 마지막 거래일이 아니라 INITIAL_DAYS 전부터 받는다
		assertThat(kiwoom.lastFrom).isEqualTo(TODAY.minusDays(IndexSyncJob.INITIAL_DAYS));
		var strip = insight.indices();
		// 소스가 없는 칸의 가짜 값은 지워져 빠지고, 실제 값만 있던 채권지수는 남는다
		assertThat(strip.items()).extracting(IndexItem::key).containsExactly(IndexKey.KOSPI, IndexKey.KRXBOND);
		IndexItem kospi = strip.items().getFirst();
		// 전일 값은 가짜 화요일 값이 아니라 같은 제공처의 월요일 값
		assertThat(kospi.prevValue()).isEqualByComparingTo("2500.00");
		assertThat(kospi.sourceName()).isEqualTo("키움증권");
		assertThat(strip.isSample()).isFalse();
	}
}
