package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.ingest.dart.DartDisclosureSource.DartException;
import com.flexable.web.market.MarketDtos.StockRef;
import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.Archive;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;

/**
 * 가상 시뮬레이션 통계용 전체 공시 수집(worker, decisions/2026-11-04-virtual-simulation 1-8). 시세·사건·시뮬레이션 자료 수집 뒤(평일 18:30) 돈다.
 * 수집 대상 STOCK 중 고유번호가 있는 종목마다 OpenDART list.json을 한 쪽 100건씩 불러 dart_disclosures에 쌓는다.
 * 처음에는 최근 5년을 받고 다 받으면 완료 표시(covered_from~covered_to)를 남긴다. 그 뒤에는 마지막으로 받은 날부터 오늘까지만 받는다.
 * 한 번 실행의 호출 상한(dartMaxCalls)에 닿으면 받던 구간과 다음 쪽을 남기고 멈춰, 다음 실행이 이어 받는다.
 * DART_API_KEY가 없거나 MARKET_DISCLOSURE_SOURCE가 dart가 아니면 건너뛴다. 실패한 종목은 다음 실행에 다시 받고 이미 쌓인 목록은 지우지 않는다.
 */
@Component
@Profile("worker")
public class DisclosureArchiveJob {

	static final String JOB = "disclosure-archive";
	static final int YEARS = 5;
	private static final Logger log = LoggerFactory.getLogger(DisclosureArchiveJob.class);

	private final MarketService market;
	private final DisclosureSource disclosures;
	private final VirtualSimStore store;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public DisclosureArchiveJob(MarketService market, DisclosureSource disclosures, VirtualSimStore store, IngestProperties props, IngestRunRepository runs,
			Clock clock) {
		this.market = market;
		this.disclosures = disclosures;
		this.store = store;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	public synchronized Run runOnce() {
		if (!"dart".equals(props.disclosureSource()) || !disclosures.enabled()) {
			log.info("전체 공시 수집 건너뜀: DART_API_KEY가 비어 있거나 MARKET_DISCLOSURE_SOURCE가 dart가 아니에요");
			return new Run("SKIPPED", 0, 0, 0, List.of(), false);
		}
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		int cap = props.virtualSim().dartMaxCalls();
		int calls = 0, saved = 0, completed = 0;
		boolean capped = false;
		List<String> errors = new ArrayList<>();
		String status;
		try {
			stocks: for (StockRef stock : market.rankedStocks()) {
				if (stock.corpCode() == null) {
					continue;
				}
				Archive a = store.archive(stock.code()).orElse(null);
				LocalDate from, to;
				int page;
				if (a != null && a.pendingFrom() != null) {
					from = a.pendingFrom();
					to = a.pendingTo();
					page = a.nextPage();
				}
				else if (a == null || !a.complete()) {
					from = today.minusYears(YEARS);
					to = today;
					page = 1;
				}
				else if (!a.coveredTo().isBefore(today)) {
					continue;
				}
				else {
					// 마지막으로 받은 날도 다시 받는다(그날 늦게 접수된 공시). 같은 접수번호는 건너뛴다
					from = a.coveredTo();
					to = today;
					page = 1;
				}
				LocalDate coveredFrom = a == null || a.coveredFrom() == null ? from : a.coveredFrom();
				try {
					while (true) {
						if (calls >= cap) {
							store.saveArchive(new Archive(stock.code(), stock.corpCode(), a == null ? null : a.coveredFrom(), a == null ? null : a.coveredTo(), from,
									to, page));
							capped = true;
							break stocks;
						}
						calls++;
						DisclosureSource.Page p = disclosures.page(stock.corpCode(), from, to, page);
						saved += store.saveDisclosures(p.items().stream()
							.map(d -> new DisclosureRow(d.receiptNo(), stock.code(), stock.corpCode(), d.reportName(), d.date()))
							.toList());
						if (page >= p.totalPages()) {
							store.saveArchive(new Archive(stock.code(), stock.corpCode(), coveredFrom, to, null, null, null));
							completed++;
							break;
						}
						page++;
					}
				}
				catch (DartException e) {
					errors.add(stock.code() + ": " + e.getMessage());
					log.warn("전체 공시 수집 실패 {}: {}", stock.code(), e.getMessage());
					if (e.stopsRun()) {
						log.warn("전체 공시 수집을 멈춰요(남은 종목은 다음 실행에)");
						break;
					}
				}
				catch (RuntimeException e) {
					errors.add(stock.code() + ": " + e.getMessage());
					log.warn("전체 공시 수집 실패 {}: {}", stock.code(), e.getMessage());
				}
			}
		}
		finally {
			status = errors.isEmpty() ? "SUCCESS" : calls == 0 || saved == 0 && completed == 0 ? "FAILED" : "PARTIAL";
			String note = !errors.isEmpty() ? errors.size() + "건 실패: " + String.join(" / ", errors)
					: capped ? "호출 상한 " + cap + "번에 닿아 남은 종목은 다음 실행에 받아요" : null;
			run.finish(status, saved, note, clock.instant());
			runs.save(run);
		}
		int archived = store.archivedStocks().size();
		log.info("전체 공시 수집 끝 {} (호출 {}번, 새 공시 {}건, 이번에 끝낸 종목 {}, 다 받은 종목 {}, 실패 {}건)", status, calls, saved, completed, archived,
				errors.size());
		return new Run(status, calls, saved, completed, List.copyOf(errors), capped);
	}

	/** saved: 새로 넣은 공시 수, completed: 이번 실행에서 구간을 다 받은 종목 수, capped: 호출 상한에 닿아 멈췄는지 */
	public record Run(String status, int calls, int saved, int completed, List<String> errors, boolean capped) {
	}
}
