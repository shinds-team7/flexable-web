package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexItem;
import com.flexable.web.market.InsightDtos.IndexValue;
import com.flexable.web.market.MarketInsightService;

/** 소스 여러 개: 한 소스가 실패해도 다른 칸은 저장되고, 실패한 칸은 직전 성공 값이 남는다. 키가 없는 소스의 칸은 건너뛴다. 외부 호출 없음. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
		properties = "spring.datasource.url=jdbc:h2:mem:worker-index-partial;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class IndexSyncPartialFailureTest {

	@Autowired
	MarketInsightService insight;
	@Autowired
	IngestProperties props;
	@Autowired
	IngestRunRepository runs;
	@Autowired
	Clock clock;

	/** 칸마다 두 날 값을 주는 소스. fail이면 호출 실패를 흉내 낸다. */
	static final class Stub implements IndexSource {
		private final String name;
		private final Set<IndexKey> keys;
		private final BigDecimal prev;
		private final BigDecimal last;
		boolean fail;

		Stub(String name, Set<IndexKey> keys, String prev, String last) {
			this.name = name;
			this.keys = keys;
			this.prev = new BigDecimal(prev);
			this.last = new BigDecimal(last);
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
			if (fail) {
				throw new IllegalStateException("호출 실패");
			}
			return List.of(new IndexValue(to.minusDays(1), prev), new IndexValue(to, last));
		}
	}

	@Test
	void 실패한_칸은_직전_값을_유지하고_키_없는_소스의_칸은_건너뛴다() {
		Stub fx = new Stub("한국수출입은행", Set.of(IndexKey.USDKRW, IndexKey.EURKRW), "1385.50", "1390.10");
		Stub krx = new Stub("한국거래소", Set.of(IndexKey.GOLD), "151200", "150800");
		Stub noKey = new Stub("키 없는 소스", Set.of(), "1", "2"); // KRXBOND를 받을 소스가 키가 없는 경우
		Stub later = new Stub("뒤에 둔 소스", Set.of(IndexKey.GOLD), "1", "2"); // 같은 칸은 앞 소스가 맡는다
		IndexSyncJob job = new IndexSyncJob(List.of(noKey, fx, krx, later), insight, props, runs, clock);

		MarketSyncJob.Result first = job.runOnce();
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(first.instruments()).isEqualTo(3);
		List<IndexItem> before = insight.indices().items();
		assertThat(before).extracting(IndexItem::key).containsExactly(IndexKey.GOLD, IndexKey.USDKRW, IndexKey.EURKRW);
		assertThat(before.getFirst().value()).isEqualByComparingTo("150800");
		assertThat(before.getFirst().sourceName()).isEqualTo("한국거래소");

		fx.fail = true;
		MarketSyncJob.Result second = job.runOnce();
		assertThat(second.status()).isEqualTo("PARTIAL");
		assertThat(second.errors()).hasSize(2).allMatch(e -> e.startsWith("USDKRW") || e.startsWith("EURKRW"));
		assertThat(runs.findFirstByJobOrderByIdDesc(IndexSyncJob.JOB).orElseThrow().getStatus()).isEqualTo("PARTIAL");
		assertThat(insight.indices().items()).usingRecursiveFieldByFieldElementComparator().containsExactlyElementsOf(before);

		krx.fail = true;
		assertThat(job.runOnce().status()).isEqualTo("FAILED");
		assertThat(insight.indices().items()).hasSize(3);
	}
}
