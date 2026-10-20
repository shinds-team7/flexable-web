package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketProperties;
import com.flexable.web.market.MarketService;

/**
 * 시세 수집(worker). 1) 시장별 시가총액 상위 목록을 받아 바꾸고 2) 그 종목들의 일봉을 받아 저장한다.
 * 처음에는 backfillYears 전부터, 이후에는 마지막 거래일 recheckDays 전부터 다시 받아 지연 등록·정정을 반영한다(05 §3).
 * 한 시장·한 종목이 실패해도 나머지는 계속하고, 실행 결과는 ingest_runs에 남긴다.
 */
@Component
@Profile("worker")
public class MarketSyncJob implements ApplicationRunner {

	static final String JOB = "market-sync";
	private static final Logger log = LoggerFactory.getLogger(MarketSyncJob.class);

	private final InstrumentSource instruments;
	private final PriceSource prices;
	private final MarketService market;
	private final MarketProperties marketProps;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public MarketSyncJob(InstrumentSource instruments, PriceSource prices, MarketService market, MarketProperties marketProps,
			IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.instruments = instruments;
		this.prices = prices;
		this.market = market;
		this.marketProps = marketProps;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (props.runOnStart()) {
			runOnce();
		}
	}

	/** 평일 저녁(장 마감·자료 반영 뒤). 정확한 시각은 제공처 갱신 시각 확인 뒤 정한다(05 §5). */
	@Scheduled(cron = "${app.ingest.cron:0 30 18 * * MON-FRI}", zone = "Asia/Seoul")
	void scheduled() {
		runOnce();
	}

	public synchronized Result runOnce() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		List<String> errors = new ArrayList<>();
		int rows = 0;
		for (Board b : Board.values()) {
			try {
				InstrumentListing l = instruments.listing(b);
				List<InstrumentRow> top = l.items().stream()
					.sorted(Comparator.comparing((InstrumentInfo i) -> i.marketCap() == null ? -1L : i.marketCap()).reversed())
					.limit(marketProps.topLimit())
					.map(i -> new InstrumentRow(i.code(), i.name(), i.market(), i.kind(), i.marketCap()))
					.toList();
				if (top.isEmpty()) {
					errors.add(b + " 목록 비어 있음");
					continue;
				}
				int n = market.replaceBoard(b, top, l.source(), l.note(), today);
				log.info("종목 목록 {} {}개 ({}{})", b, n, l.source(), l.note() == null ? "" : ", " + l.note());
			}
			catch (RuntimeException e) {
				errors.add(b + " 목록: " + e.getMessage());
				log.warn("종목 목록 실패 {}: {}", b, e.getMessage());
			}
		}

		List<String> codes = market.rankedCodes();
		int done = 0;
		for (String code : codes) {
			LocalDate from = market.latestTradeDate(code)
				.map(d -> d.minusDays(props.recheckDays()))
				.orElse(today.minusYears(props.backfillYears()));
			try {
				List<DailyBar> bars = prices.dailyBars(code, from, today);
				Map<LocalDate, Long> volumes = new HashMap<>();
				bars.forEach(bar -> volumes.put(bar.date(), bar.volume()));
				rows += market.saveDailyCloses(code, bars.stream().map(bar -> new DailyClose(bar.date(), bar.close())).toList(), volumes,
						prices.source());
			}
			catch (RuntimeException e) {
				errors.add(code + ": " + e.getMessage());
				log.warn("시세 실패 {}: {}", code, e.getMessage());
			}
			if (++done % 20 == 0 || done == codes.size()) {
				log.info("시세 {}/{} 종목, {}줄 저장", done, codes.size(), rows);
			}
		}

		String status = errors.isEmpty() ? "SUCCESS" : codes.isEmpty() ? "FAILED" : "PARTIAL";
		run.finish(status, rows, errors.isEmpty() ? null : errors.size() + "건 실패: " + String.join(" / ", errors), clock.instant());
		runs.save(run);
		log.info("시세 수집 끝 {} ({}종목, {}줄, 실패 {}건)", status, codes.size(), rows, errors.size());
		return new Result(status, codes.size(), rows, errors);
	}

	public record Result(String status, int instruments, int rows, List<String> errors) {
	}
}
