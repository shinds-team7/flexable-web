package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.ingest.dart.DartDisclosureSource.DartException;
import com.flexable.web.virtualsim.PlacementDetails;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.DetailRow;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;

/**
 * 배치고사 공시 주요 내용 수집(worker, decisions/2026-11-05-virtual-sim-contest 2-2, policies §8-8 "공시 주요 내용"). 전체 공시 수집(DisclosureArchiveJob) 뒤 돈다.
 * 공시 목록을 다 받은 종목의 최근 5년 공시 중 구조화 자료가 있는 유형(PlacementDetails.api)이고 아직 지금 규칙 버전으로 받지 않은 것만,
 * 종목·API마다 그 공시들의 접수일 구간으로 OpenDART 주요사항보고서 주요정보(DS005)를 한 번 부른다. 화면용 항목을 만들어 접수번호마다 저장하고,
 * 응답에 없는 공시는 같은 공시의 나중 정정본 행을 쓰고(corrected), 그것도 없으면 빈 항목으로 저장해 다시 부르지 않는다. 호출 상한(전체 공시 수집이 쓰고 남은 VIRTUAL_SIM_DART_MAX_CALLS)에 닿으면 멈추고 다음 실행이 이어 받는다.
 * 실패한 종목·API는 저장하지 않아 다음 실행에 다시 받고, 공시 목록(dart_disclosures)은 건드리지 않는다.
 */
@Component
@Profile("worker")
public class DisclosureDetailJob {

	static final String JOB = "disclosure-detail";
	static final int YEARS = 5;
	/** DS005 자료는 2015년부터 */
	static final LocalDate DATA_FROM = LocalDate.of(2015, 1, 1);
	/** DS005 기간은 최초 접수일 기준이라, 정정 공시가 잡히게 구간 앞을 넉넉히 둔다 */
	static final int LOOKBACK_DAYS = 180;
	/** 원 공시의 정정본으로 볼 수 있는 기간(원 공시 접수일부터) */
	static final int CORRECTION_DAYS = 180;
	private static final Logger log = LoggerFactory.getLogger(DisclosureDetailJob.class);

	private final DisclosureSource disclosures;
	private final VirtualSimStore store;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public DisclosureDetailJob(DisclosureSource disclosures, VirtualSimStore store, IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.disclosures = disclosures;
		this.store = store;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	/** 호출 상한 cap번까지 */
	public synchronized Run runOnce(int cap) {
		if (!"dart".equals(props.disclosureSource()) || !disclosures.enabled()) {
			log.info("공시 주요 내용 수집 건너뜀: DART_API_KEY가 비어 있거나 MARKET_DISCLOSURE_SOURCE가 dart가 아니에요");
			return new Run("SKIPPED", 0, 0, List.of(), false);
		}
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		LocalDate since = today.minusYears(YEARS);
		int calls = 0, saved = 0;
		boolean capped = false;
		List<String> errors = new ArrayList<>();
		String status;
		try {
			stocks: for (String stock : store.archivedStocks()) {
				Set<String> done = store.detailedReceipts(stock);
				// API → 아직 받지 않은 공시(접수일 순)
				Map<String, List<DisclosureRow>> todo = new LinkedHashMap<>();
				// API → 그 종목의 같은 API 공시 전체(이미 받은 것 포함). 정정 공시를 찾을 때 쓴다
				Map<String, List<DisclosureRow>> sameApi = new HashMap<>();
				for (DisclosureRow d : store.disclosures(stock)) {
					String api = PlacementDetails.api(d.title());
					if (api == null) {
						continue;
					}
					sameApi.computeIfAbsent(api, k -> new ArrayList<>()).add(d);
					if (!d.date().isBefore(since) && !d.date().isBefore(DATA_FROM) && !done.contains(d.receiptNo())) {
						todo.computeIfAbsent(api, k -> new ArrayList<>()).add(d);
					}
				}
				for (var e : todo.entrySet()) {
					if (calls >= cap) {
						capped = true;
						break stocks;
					}
					List<DisclosureRow> rows = e.getValue();
					LocalDate from = rows.stream().map(DisclosureRow::date).min(Comparator.naturalOrder()).orElseThrow().minusDays(LOOKBACK_DAYS);
					LocalDate to = rows.stream().map(DisclosureRow::date).max(Comparator.naturalOrder()).orElseThrow();
					try {
						calls++;
						List<Map<String, String>> got = disclosures.majorReport(e.getKey(), rows.getFirst().corpCode(), from.isBefore(DATA_FROM) ? DATA_FROM : from, to);
						Map<String, Map<String, String>> byReceipt = new HashMap<>();
						got.forEach(r -> byReceipt.put(r.get("rcept_no"), r));
						List<DisclosureRow> filings = sameApi.get(e.getKey());
						saved += store.saveDetails(rows.stream().map(d -> {
							Map<String, String> r = byReceipt.containsKey(d.receiptNo()) ? byReceipt.get(d.receiptNo()) : corrected(d, filings, byReceipt);
							return new DetailRow(d.receiptNo(), VirtualSimCategory.classify(d.title()), r == null ? List.of() : PlacementDetails.items(e.getKey(), r));
						}).toList());
					}
					catch (DartException ex) {
						errors.add(stock + " " + e.getKey() + ": " + ex.getMessage());
						log.warn("공시 주요 내용 수집 실패 {} {}: {}", stock, e.getKey(), ex.getMessage());
						if (ex.stopsRun()) {
							log.warn("공시 주요 내용 수집을 멈춰요(남은 종목은 다음 실행에)");
							break stocks;
						}
					}
					catch (RuntimeException ex) {
						errors.add(stock + " " + e.getKey() + ": " + ex.getMessage());
						log.warn("공시 주요 내용 수집 실패 {} {}: {}", stock, e.getKey(), ex.getMessage());
					}
				}
			}
		}
		finally {
			status = errors.isEmpty() ? "SUCCESS" : saved == 0 ? "FAILED" : "PARTIAL";
			String note = !errors.isEmpty() ? errors.size() + "건 실패: " + String.join(" / ", errors)
					: capped ? "호출 상한 " + cap + "번에 닿아 남은 공시는 다음 실행에 받아요" : null;
			run.finish(status, saved, note, clock.instant());
			runs.save(run);
		}
		log.info("공시 주요 내용 수집 끝 {} (호출 {}번, 저장 {}건, 실패 {}건{})", status, calls, saved, errors.size(), capped ? ", 상한 도달" : "");
		return new Run(status, calls, saved, List.copyOf(errors), capped);
	}

	/**
	 * DS005는 정정된 공시를 마지막 정정본의 접수번호로만 돌려준다(로컬 DB 확인: 나중에 정정된 원 공시는 대부분 응답에 없음). 그래서 응답에 없는 공시는
	 * 같은 종목·같은 API에서 제목이 같은(앞의 [기재정정] 표시 제외) 나중 공시 중 CORRECTION_DAYS 안에 접수된 것을 가까운 순으로 보고, 응답에 있는 첫 행을 쓴다.
	 * 그 사이에 같은 제목의 새 원 공시(정정 표시 없음)가 있으면 다른 공시로 보고 멈춘다
	 */
	static Map<String, String> corrected(DisclosureRow d, List<DisclosureRow> sameApi, Map<String, Map<String, String>> byReceipt) {
		String key = PlacementDetails.sameFilingKey(d.title());
		List<DisclosureRow> later = sameApi.stream()
			.filter(c -> !c.receiptNo().equals(d.receiptNo()) && key.equals(PlacementDetails.sameFilingKey(c.title())))
			.filter(c -> c.receiptNo().compareTo(d.receiptNo()) > 0 && !c.date().isAfter(d.date().plusDays(CORRECTION_DAYS)))
			.sorted(Comparator.comparing(DisclosureRow::receiptNo))
			.toList();
		for (DisclosureRow c : later) {
			if (!c.title().trim().startsWith("[")) {
				return null;
			}
			Map<String, String> r = byReceipt.get(c.receiptNo());
			if (r != null) {
				return r;
			}
		}
		return null;
	}

	/** saved: 이번에 저장한 공시 수(항목이 없는 공시 포함), capped: 호출 상한에 닿아 멈췄는지 */
	public record Run(String status, int calls, int saved, List<String> errors, boolean capped) {
	}
}
