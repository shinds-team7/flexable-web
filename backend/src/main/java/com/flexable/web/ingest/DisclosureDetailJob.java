package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Instant;
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
import com.flexable.web.virtualsim.VirtualContestQuestions;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.DetailRow;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;

/**
 * 배치고사 공시 주요 내용 수집(worker, decisions/2026-11-05-virtual-sim-contest 2-2, policies §8-8 "공시 주요 내용"). 전체 공시 수집(DisclosureArchiveJob) 뒤 돈다.
 * 공시 목록을 다 받은 종목의 최근 5년 공시 중 구조화 자료가 있는 유형(PlacementDetails.api)이고 아직 지금 규칙 버전으로 받지 않은 것만,
 * 종목·API마다 그 공시들의 접수일 구간으로 OpenDART 주요사항보고서 주요정보(DS005)를 한 번 부른다. 화면용 항목을 만들어 접수번호마다 저장하고,
 * 응답에 없는 공시는 같은 공시의 나중 정정본 행을 쓰고(corrected), 그것도 없으면 빈 항목으로 저장해 다시 부르지 않는다. 호출 상한(전체 공시 수집이 쓰고 남은 VIRTUAL_SIM_DART_MAX_CALLS)에 닿으면 멈추고 다음 실행이 이어 받는다.
 * 정정 공시를 받을 때는 그 원 공시도 같은 응답으로 다시 평가한다(withOriginals). 응답 형식 오류(DartDisclosureSource)를 포함해 실패한 묶음은 저장하지 않고
 * dart_detail_failures에 남겨 다음 실행에 맨 뒤로 미뤄 다시 받는다(그 사이 다른 묶음이 먼저 진행된다). 공시 목록(dart_disclosures)은 건드리지 않는다.
 * 공급 계약(PlacementDetails.fromDocument, Issue #375)은 DS005가 없어 종목마다 원공시(정정 공시는 빼고, 문제는 원공시로만 나온다)의 공시서류원본파일을 한 건에 한 번씩 받아
 * 매출액 대비·계약 기간만 뽑아 저장한다(PlacementDetails.DOCUMENT 묶음, 같은 호출 상한). 원문·본문 글은 저장하지 않는다.
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
			// 1) 종목·API 묶음을 모은다. 정정 공시가 새로 들어온 묶음에는 그 원 공시(이미 받았어도)를 다시 넣어 정정된 값으로 다시 평가한다
			List<Group> groups = new ArrayList<>();
			for (String stock : store.archivedStocks()) {
				Set<String> done = store.detailedReceipts(stock);
				Map<String, List<DisclosureRow>> todo = new LinkedHashMap<>();
				// API → 그 종목의 같은 API 공시 전체(이미 받은 것 포함). 정정 공시를 찾을 때 쓴다
				Map<String, List<DisclosureRow>> sameApi = new HashMap<>();
				List<DisclosureRow> documents = new ArrayList<>();
				for (DisclosureRow d : store.disclosures(stock)) {
					if (PlacementDetails.fromDocument(d.title()) && !VirtualContestQuestions.correction(d.title()) && inRange(d, since) && !done.contains(d.receiptNo())) {
						documents.add(d);
						continue;
					}
					String api = PlacementDetails.api(d.title());
					if (api == null) {
						continue;
					}
					sameApi.computeIfAbsent(api, k -> new ArrayList<>()).add(d);
					if (inRange(d, since) && !done.contains(d.receiptNo())) {
						todo.computeIfAbsent(api, k -> new ArrayList<>()).add(d);
					}
				}
				todo.forEach((api, rows) -> groups.add(new Group(stock, api, withOriginals(rows, sameApi.get(api), since), sameApi.get(api))));
				if (!documents.isEmpty()) {
					documents.sort(Comparator.comparing(DisclosureRow::receiptNo).reversed());
					groups.add(new Group(stock, PlacementDetails.DOCUMENT, List.copyOf(documents), List.of()));
				}
			}
			// 2) 실패한 적 없는 묶음을 먼저, 실패한 묶음은 오래 전에 실패한 순으로 맨 뒤에. 같은 묶음이 계속 실패해도 상한을 다 써서 뒤 종목이 막히지 않는다
			Map<String, Instant> failed = store.detailFailures();
			groups.sort(Comparator.comparing((Group g) -> failed.containsKey(g.key())).thenComparing(g -> failed.getOrDefault(g.key(), Instant.EPOCH)));
			for (Group g : groups) {
				if (calls >= cap) {
					capped = true;
					break;
				}
				LocalDate from = g.rows().stream().map(DisclosureRow::date).min(Comparator.naturalOrder()).orElseThrow().minusDays(LOOKBACK_DAYS);
				LocalDate to = g.rows().stream().map(DisclosureRow::date).max(Comparator.naturalOrder()).orElseThrow();
				try {
					if (PlacementDetails.DOCUMENT.equals(g.api())) {
						// 공시마다 원문 한 번. 한 건씩 저장하므로 상한에 닿거나 실패해도 그때까지 받은 공시는 남는다
						boolean all = true;
						for (DisclosureRow d : g.rows()) {
							if (calls >= cap) {
								capped = true;
								all = false;
								break;
							}
							calls++;
							String text = disclosures.documentText(d.receiptNo());
							saved += store.saveDetails(List.of(new DetailRow(d.receiptNo(), VirtualSimCategory.classify(d.title()), PlacementDetails.supplyContract(text))));
						}
						if (all) {
							store.clearDetailFailure(g.stock(), g.api());
						}
						continue;
					}
					calls++;
					List<Map<String, String>> got = disclosures.majorReport(g.api(), g.rows().getFirst().corpCode(), from.isBefore(DATA_FROM) ? DATA_FROM : from, to);
					Map<String, Map<String, String>> byReceipt = new HashMap<>();
					got.forEach(r -> byReceipt.put(r.get("rcept_no"), r));
					saved += store.saveDetails(g.rows().stream().map(d -> {
						Map<String, String> r = byReceipt.containsKey(d.receiptNo()) ? byReceipt.get(d.receiptNo()) : corrected(d, g.filings(), byReceipt);
						return new DetailRow(d.receiptNo(), VirtualSimCategory.classify(d.title()), r == null ? List.of() : PlacementDetails.items(g.api(), r));
					}).toList());
					store.clearDetailFailure(g.stock(), g.api());
				}
				catch (DartException ex) {
					errors.add(g.key() + ": " + ex.getMessage());
					log.warn("공시 주요 내용 수집 실패 {}: {}", g.key(), ex.getMessage());
					if (ex.stopsRun()) {
						// 키·한도 문제는 그 묶음 탓이 아니라 실패로 남기지 않는다
						log.warn("공시 주요 내용 수집을 멈춰요(남은 묶음은 다음 실행에)");
						break;
					}
					store.recordDetailFailure(g.stock(), g.api(), ex.getMessage());
				}
				catch (RuntimeException ex) {
					errors.add(g.key() + ": " + ex.getMessage());
					log.warn("공시 주요 내용 수집 실패 {}: {}", g.key(), ex.getMessage());
					store.recordDetailFailure(g.stock(), g.api(), ex.getMessage());
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

	/** 종목·API 묶음. rows: 이번에 저장할 공시(받을 공시 + 다시 평가할 원 공시), filings: 그 종목의 같은 API 공시 전체 */
	record Group(String stock, String api, List<DisclosureRow> rows, List<DisclosureRow> filings) {

		String key() {
			return stock + " " + api;
		}
	}

	private static boolean inRange(DisclosureRow d, LocalDate since) {
		return !d.date().isBefore(since) && !d.date().isBefore(DATA_FROM);
	}

	/**
	 * 받을 공시에 정정 공시가 있으면, 그 앞의 같은 공시(같은 제목, CORRECTION_DAYS 안)를 정정 표시 없는 원 공시까지 거슬러 함께 넣는다(이미 받은 것도).
	 * 원 공시를 먼저 받아 둔 뒤 정정으로 비율·규모가 바뀌면 새 문제에도 이전 값이 남지 않게, 원 공시를 같은 응답으로 다시 평가한다
	 */
	static List<DisclosureRow> withOriginals(List<DisclosureRow> rows, List<DisclosureRow> filings, LocalDate since) {
		Map<String, DisclosureRow> out = new java.util.TreeMap<>();
		rows.forEach(d -> out.put(d.receiptNo(), d));
		for (DisclosureRow d : rows) {
			if (!d.title().trim().startsWith("[")) {
				continue;
			}
			String key = PlacementDetails.sameFilingKey(d.title());
			List<DisclosureRow> earlier = filings.stream()
				.filter(c -> key.equals(PlacementDetails.sameFilingKey(c.title())) && c.receiptNo().compareTo(d.receiptNo()) < 0
						&& !c.date().isBefore(d.date().minusDays(CORRECTION_DAYS)))
				.sorted(Comparator.comparing(DisclosureRow::receiptNo).reversed())
				.toList();
			for (DisclosureRow c : earlier) {
				if (inRange(c, since)) {
					out.putIfAbsent(c.receiptNo(), c);
				}
				if (!c.title().trim().startsWith("[")) {
					break;
				}
			}
		}
		return List.copyOf(out.values());
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
