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
 * 처음에는 backfillYears 전 그 달 1일보다 일주일 앞부터(화면의 "5년 전"이 그 달 1일부터 계산하므로), 이후에는 마지막 거래일
 * recheckDays 전부터 다시 받아 지연 등록·정정을 반영한다(05 §3). 예전 규칙(정확히 N년 전부터)으로 받아 앞부분이 빈 종목은 한 번 다시 채운다.
 * 한 시장·한 종목이 실패해도 나머지는 계속하고, 실행 결과는 ingest_runs에 남긴다. 끝나면 사건 탐지·공시 근거(MarketEventJob)를 이어 돌린다.
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
	private final MarketEventJob eventJob;

	public MarketSyncJob(InstrumentSource instruments, PriceSource prices, MarketService market, MarketProperties marketProps,
			IngestProperties props, IngestRunRepository runs, Clock clock, MarketEventJob eventJob) {
		this.instruments = instruments;
		this.prices = prices;
		this.market = market;
		this.marketProps = marketProps;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
		this.eventJob = eventJob;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (props.runOnStart()) {
			runAll();
		}
	}

	/** 평일 저녁(장 마감·자료 반영 뒤). 정확한 시각은 제공처 갱신 시각 확인 뒤 정한다(05 §5). */
	@Scheduled(cron = "${app.ingest.cron:0 30 18 * * MON-FRI}", zone = "Asia/Seoul")
	void scheduled() {
		runAll();
	}

	/** 시세 수집 → 사건 탐지·공시 근거. 시세가 일부 실패해도 받은 것으로 사건을 찾는다. */
	void runAll() {
		runOnce();
		eventJob.runOnce();
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
		LocalDate backfillFrom = backfillFrom(today, props.backfillYears());
		int done = 0;
		for (String code : codes) {
			LocalDate from = market.latestTradeDate(code)
				.map(d -> d.minusDays(props.recheckDays()))
				.orElse(backfillFrom);
			if (needsHeadFill(market.earliestTradeDate(code).orElse(null), today, props.backfillYears())) {
				from = backfillFrom;
			}
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

	/** 처음 받을 시작일: N년 전 그 달 1일보다 일주일 앞(계산이 시작일 1주 앞 종가부터 읽는다). */
	static LocalDate backfillFrom(LocalDate today, int years) {
		return today.minusYears(years).withDayOfMonth(1).minusDays(7);
	}

	/**
	 * 예전 규칙(정확히 N년 전부터)으로 받아 그 달 앞부분이 빈 종목인지. 첫 거래일이 새 시작일보다 늦고 예전 시작일 근처(10일 안)일 때만.
	 * 그보다 늦게 상장한 종목은 해당하지 않아 매번 다시 받지 않는다.
	 */
	static boolean needsHeadFill(LocalDate earliest, LocalDate today, int years) {
		if (earliest == null) {
			return false;
		}
		LocalDate oldStart = today.minusYears(years);
		return earliest.isAfter(backfillFrom(today, years).plusDays(10)) && !earliest.isAfter(oldStart.plusDays(10));
	}

	public record Result(String status, int instruments, int rows, List<String> errors) {
	}
}
