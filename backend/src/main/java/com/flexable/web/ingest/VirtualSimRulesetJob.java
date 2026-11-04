package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.market.MarketDtos.PriceRow;
import com.flexable.web.market.MarketDtos.StockRef;
import com.flexable.web.market.MarketService;
import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.market.PracticeMarketService;
import com.flexable.web.virtualsim.VirtualSimRules;
import com.flexable.web.virtualsim.VirtualSimRules.Filing;
import com.flexable.web.virtualsim.VirtualSimRules.Series;
import com.flexable.web.virtualsim.VirtualSimRuleset;
import com.flexable.web.virtualsim.VirtualSimStore;

/**
 * 가상 시뮬레이션 룰셋 추출(worker, decisions/2026-11-04-virtual-simulation 1, policies §8-3). 전체 공시 수집(DisclosureArchiveJob) 뒤 돈다.
 * 수집 대상 STOCK의 최근 5년 일봉(daily_prices), 5년 공시 목록을 다 받은 종목의 공시(dart_disclosures), practice_datasets OHLC로
 * 유형별 경로·상승 비율·경향과 변동성 등급별 분위표를 만든다. 조건(유형 3개·뚜렷한 유형 2개·등급별 표본)을 못 채우면 새 룰셋을 만들지 않고 직전 것을 둔다.
 * 급변동 사건에 붙은 공시(event_sources)는 쓰지 않는다. VIRTUAL_SIM_SOURCE=fake면 코드에 넣은 예시 룰셋을 쓰므로 건너뛴다.
 */
@Component
@Profile("worker")
public class VirtualSimRulesetJob {

	static final String JOB = "virtual-sim-rules";
	static final int YEARS = 5;
	private static final Logger log = LoggerFactory.getLogger(VirtualSimRulesetJob.class);

	private final MarketService market;
	private final PracticeMarketService practice;
	private final VirtualSimStore store;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public VirtualSimRulesetJob(MarketService market, PracticeMarketService practice, VirtualSimStore store, IngestProperties props, IngestRunRepository runs,
			Clock clock) {
		this.market = market;
		this.practice = practice;
		this.store = store;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	public synchronized Run runOnce() {
		if ("fake".equals(props.virtualSim().source())) {
			return new Run("SKIPPED", 0, 0, "예시 룰셋(코드)을 써요");
		}
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		String status = "FAILED", note = null;
		int types = 0, archivedUsed = 0;
		try {
			LocalDate from = today.minusYears(YEARS);
			Set<String> archived = new HashSet<>(store.archivedStocks());
			List<Series> series = new ArrayList<>();
			Map<String, List<Filing>> filings = new HashMap<>();
			List<String> codes = new ArrayList<>();
			for (StockRef stock : market.rankedStocks()) {
				List<PriceRow> rows = market.dailyPrices(stock.code(), from);
				if (rows.size() < 2) {
					continue;
				}
				codes.add(stock.code());
				series.add(new Series(stock.code(), rows.stream().map(PriceRow::date).toList(), rows.stream().map(PriceRow::close).toList(),
						rows.stream().map(PriceRow::volume).toList()));
				if (archived.contains(stock.code())) {
					filings.put(stock.code(), store.disclosures(stock.code()).stream()
						.filter(d -> !d.date().isBefore(from))
						.map(d -> new Filing(d.receiptNo(), d.title(), d.date()))
						.toList());
				}
			}
			archivedUsed = filings.size();
			Map<String, List<Candle>> ohlc = new HashMap<>();
			practice.all().stream().filter(d -> !d.isSample()).forEach(d -> ohlc.put(d.instrument().code(), d.candles()));
			List<String> sources = new ArrayList<>();
			sources.add("금융감독원 DART 공시 목록");
			sources.addAll(market.sources(codes).prices());
			var built = VirtualSimRules.build(new VirtualSimRules.Input(series, filings, ohlc, sources));
			if (built.isPresent()) {
				VirtualSimRuleset r = built.get();
				store.saveRuleset(r);
				types = r.categories().size();
				status = "SUCCESS";
				log.info("가상 시뮬레이션 룰셋 저장 (종목 {}, 공시 다 받은 종목 {}, 유형 {}개, 뚜렷한 유형 {}개, 자료 {}~{})", series.size(), archivedUsed, types,
						r.categories().stream().filter(VirtualSimRuleset.CategoryStats::clear).count(), r.dataFrom(), r.dataTo());
				r.categories().forEach(c -> log.info("  {} 경로 {} 상승 비율 {} 경향 {}", c.category(), c.paths(), c.upShare(), c.trend()));
			}
			else {
				status = "SKIPPED";
				note = "조건(유형 3개·뚜렷한 유형 2개·등급별 표본)을 못 채워 직전 룰셋을 둬요(공시 다 받은 종목 " + archivedUsed + ")";
				log.info("가상 시뮬레이션 룰셋 건너뜀: {}", note);
			}
		}
		catch (RuntimeException e) {
			status = "FAILED";
			note = e.getMessage() == null ? e.getClass().getSimpleName() : e.getMessage();
			log.warn("가상 시뮬레이션 룰셋 실패: {}", note);
		}
		finally {
			run.finish(status, types, note, clock.instant());
			runs.save(run);
		}
		return new Run(status, types, archivedUsed, note);
	}

	/** types: 저장한 룰셋의 유형 수, archived: 공시를 다 받아 경로에 쓴 종목 수 */
	public record Run(String status, int types, int archived, String note) {
	}
}
