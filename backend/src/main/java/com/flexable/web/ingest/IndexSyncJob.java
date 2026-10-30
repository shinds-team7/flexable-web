package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.MarketInsightService;

/**
 * 시장 띠 수집(worker). 소스 여러 개(키움·KRX·수출입은행 또는 가짜)에서 칸마다 그 칸을 받을 수 있는 첫 소스를 쓴다. 키가 없는 소스는 칸을 내놓지 않아 그 칸은 건너뛴다.
 * 건너뛴 칸에 남은 가짜 값은 지운다(실제 제공처 값은 마지막 성공 값으로 둔다).
 * 칸마다 그 소스가 처음이면 INITIAL_DAYS 전부터, 이후에는 그 소스의 마지막 거래일 recheckDays 전부터 다시 받아 정정을 반영한다.
 * 저장이 성공하면 그 칸의 다른 제공처 값은 지운다(가짜 → 실제 전환 때 두 제공처 값이 섞이지 않게).
 * 한 칸이 실패해도 나머지는 계속하고, 실패한 칸은 마지막 성공 값을 그대로 둔다. MarketSyncJob이 시세 수집보다 먼저 부른다(몇 칸뿐이라 금방 끝난다).
 */
@Component
@Profile("worker")
public class IndexSyncJob {

	static final String JOB = "index-sync";
	static final int INITIAL_DAYS = 30;
	private static final Logger log = LoggerFactory.getLogger(IndexSyncJob.class);

	private final List<IndexSource> sources;
	private final MarketInsightService store;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public IndexSyncJob(List<IndexSource> sources, MarketInsightService store, IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.sources = List.copyOf(sources);
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
		Map<IndexKey, IndexSource> plan = new LinkedHashMap<>();
		for (IndexKey key : IndexKey.values()) {
			sources.stream().filter(s -> s.keys().contains(key)).findFirst().ifPresent(s -> plan.put(key, s));
		}
		for (IndexKey key : IndexKey.values()) {
			if (!plan.containsKey(key) && store.deleteSampleIndex(key) > 0) {
				log.info("시장 띠 {}: 소스가 없어 남은 가짜 값을 지웠다", key);
			}
		}
		for (Map.Entry<IndexKey, IndexSource> e : plan.entrySet()) {
			IndexKey key = e.getKey();
			IndexSource source = e.getValue();
			LocalDate from = store.latestIndexDate(key, source.source()).map(d -> d.minusDays(props.recheckDays())).orElse(today.minusDays(INITIAL_DAYS));
			try {
				rows += store.saveIndex(key, source.daily(key, from, today), source.source());
			}
			catch (RuntimeException ex) {
				errors.add(key + ": " + ex.getMessage());
				log.warn("시장 띠 실패 {}: {}", key, ex.getMessage());
			}
		}
		String status = errors.isEmpty() ? "SUCCESS" : errors.size() == plan.size() ? "FAILED" : "PARTIAL";
		run.finish(status, rows, errors.isEmpty() ? null : errors.size() + "건 실패: " + String.join(" / ", errors), clock.instant());
		runs.save(run);
		log.info("시장 띠 수집 끝 {} ({}칸, {}줄)", status, plan.size(), rows);
		return new MarketSyncJob.Result(status, plan.size(), rows, errors);
	}
}
