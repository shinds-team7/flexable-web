package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.MarketInsightService;

/**
 * 시장 띠 수집(worker). 소스가 받을 수 있는 칸마다 처음에는 INITIAL_DAYS 전부터, 이후에는 마지막 거래일 recheckDays 전부터 다시 받아 정정을 반영한다.
 * 한 칸이 실패해도 나머지는 계속하고, 실패한 칸은 마지막 성공 값을 그대로 둔다. MarketSyncJob이 시세 수집 뒤에 부른다.
 */
@Component
@Profile("worker")
public class IndexSyncJob {

	static final String JOB = "index-sync";
	static final int INITIAL_DAYS = 30;
	private static final Logger log = LoggerFactory.getLogger(IndexSyncJob.class);

	private final IndexSource source;
	private final MarketInsightService store;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public IndexSyncJob(IndexSource source, MarketInsightService store, IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.source = source;
		this.store = store;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	public synchronized MarketSyncJob.Result runOnce() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		List<String> errors = new ArrayList<>();
		int rows = 0;
		List<IndexKey> keys = List.of(IndexKey.values()).stream().filter(source.keys()::contains).toList();
		for (IndexKey key : keys) {
			LocalDate from = store.latestIndexDate(key).map(d -> d.minusDays(props.recheckDays())).orElse(today.minusDays(INITIAL_DAYS));
			try {
				rows += store.saveIndex(key, source.daily(key, from, today), source.source());
			}
			catch (RuntimeException e) {
				errors.add(key + ": " + e.getMessage());
				log.warn("시장 띠 실패 {}: {}", key, e.getMessage());
			}
		}
		String status = errors.isEmpty() ? "SUCCESS" : errors.size() == keys.size() ? "FAILED" : "PARTIAL";
		run.finish(status, rows, errors.isEmpty() ? null : errors.size() + "건 실패: " + String.join(" / ", errors), clock.instant());
		runs.save(run);
		log.info("시장 띠 수집 끝 {} ({}칸, {}줄)", status, keys.size(), rows);
		return new MarketSyncJob.Result(status, keys.size(), rows, errors);
	}
}
