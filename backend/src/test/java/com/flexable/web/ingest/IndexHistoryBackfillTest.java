package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;
import com.flexable.web.market.MarketInsightService;

/** historyDays가 있는 소스: 최근 값만 쌓인 칸은 첫 거래일 앞을 한 번 채우고, 다 채운 뒤에는 다시 부르지 않는다. 시장 띠 값은 그대로다. 외부 호출 없음. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE,
		properties = "spring.datasource.url=jdbc:h2:mem:worker-index-history;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class IndexHistoryBackfillTest {

	@Autowired
	MarketInsightService insight;
	@Autowired
	IngestProperties props;
	@Autowired
	IngestRunRepository runs;
	@Autowired
	Clock clock;

	/** 평일마다 1000.00을 주고 받은 구간을 기록하는 소스 */
	static final class History implements IndexSource {
		final List<LocalDate[]> calls = new ArrayList<>();
		int historyDays;

		@Override
		public String source() {
			return "과거 소스";
		}

		@Override
		public Set<IndexKey> keys() {
			return Set.of(IndexKey.KOSPI);
		}

		@Override
		public int historyDays() {
			return historyDays;
		}

		@Override
		public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
			calls.add(new LocalDate[] { from, to });
			List<IndexValue> out = new ArrayList<>();
			for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
				if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
					out.add(new IndexValue(d, new BigDecimal("1000.00")));
				}
			}
			return out;
		}
	}

	@Test
	void 최근_값만_있으면_과거를_한_번_채우고_다시_부르지_않는다() {
		History src = new History();
		IndexSyncJob job = new IndexSyncJob(List.of(src), insight, props, runs, clock);
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));

		job.runOnce(); // historyDays 0: 지금처럼 최근 30일만
		assertThat(src.calls).hasSize(1);
		assertThat(insight.earliestIndexDate(IndexKey.KOSPI, "과거 소스").orElseThrow()).isAfterOrEqualTo(today.minusDays(IndexSyncJob.INITIAL_DAYS));
		var before = insight.indices().items();

		src.historyDays = 400;
		src.calls.clear();
		job.runOnce(); // 최근 다시 받기 + 첫 거래일 앞 채우기
		assertThat(src.calls).hasSize(2);
		LocalDate target = today.minusDays(400);
		assertThat(src.calls.get(1)[0]).isEqualTo(target);
		assertThat(insight.earliestIndexDate(IndexKey.KOSPI, "과거 소스").orElseThrow()).isBefore(target.plusDays(IndexSyncJob.HISTORY_SLACK_DAYS));
		assertThat(insight.indices().items()).isEqualTo(before); // 시장 띠는 마지막 두 값만 본다

		src.calls.clear();
		job.runOnce(); // 다 채웠으니 최근 값만
		assertThat(src.calls).hasSize(1);
	}
}
