package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flexable.web.ingest.dart.DartDisclosureSource.DartException;
import com.flexable.web.market.MarketDtos.StockRef;
import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.PlacementSummaries;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualContestQuestions;
import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;
import com.flexable.web.virtualsim.VirtualSimStore.SummaryRow;

/**
 * 배치고사 공시 AI 요약(worker, decisions/2026-11-09-placement-ai-summary, policies §8-8 "공시 AI 요약"). 평일 수집과 따로 자기 일정(PLACEMENT_SUMMARY_CRON, 기본 매일 21:00)에 돌고,
 * PLACEMENT_SUMMARY_ON_START면 worker가 켜질 때도 한 번 돈다(시세 수집이 켜질 때 돌면 그 뒤에 돈다). 하루 상한은 DB에 세므로 하루에 여러 번 돌아도 넘지 않는다.
 * 대상은 배치고사 후보가 될 수 있는 공시(공시 목록을 다 받은 종목의 최근 5년 공시 중 유형으로 분류되는 것. 원공시가 기간 밖인 정정 공시는 뺀다)이고, 지금 작성 규칙 버전으로 만들지 않았고 숨기지 않은 것만이다.
 * 정정 공시는 문제로 나오지 않으므로(원공시에 합침) 원공시를 다 요약한 뒤에 한다.
 * 배치고사 10문제 중 4문제가 반응 창 근거 유형(VirtualContestQuestions.EVIDENCE_TYPES, decisions/2026-11-09-placement-reaction-window)에서 나오므로 그 유형 공시를 먼저, 그다음 공시 주요 내용이 없는 공시를, 같으면 최근 공시부터 batchSize건씩 묶는다. 묶음마다 OpenDART 공시서류원본파일을 공시마다 한 번 받아 본문 글을 뽑고,
 * 부르기 전마다 하루(KST) Gemini 호출 상한(dailyCap, gemini_daily_usage)을 확인한 뒤 한 번 부른다. 한 번 실행에 maxCalls번까지다.
 * 검사에 걸린 요약은 까닭을 붙여 한 번 더 부르고(다시 쓰기, 하루 상한에 함께 센다), 그래도 걸리면 요약 없이 까닭만 남긴다. 원문이 없는 공시도 까닭만 남긴다.
 * 같은 입력(같은 작성 규칙 버전)은 다시 부르지 않는다. 검사를 통과한 요약만 저장하고 원문·본문 글은 저장하지 않는다.
 * 그 공시만의 원문 받기 실패는 dart_summary_failures(V34)에 남겨 다음 실행에서 맨 뒤로 미루고, 실패가 있으면 실행을 SUCCESS로 기록하지 않는다(PARTIAL·FAILED).
 * 키가 없거나 호출이 실패하면 거기서 멈추고 남은 공시는 다음 실행에 한다. 다시 쓰기 응답에서 빠진 공시는 저장하지 않는다. 출제·채점은 요약 없이 그대로다.
 * 로그·ingest_runs에는 건수와 오류 구분, 검사 탈락 까닭(걸린 낱말·숫자 토막, 이름은 까닭 이름만)만 남기고 본문·프롬프트·응답은 남기지 않는다.
 */
@Component
@Profile("worker")
public class PlacementSummaryJob {

	static final String JOB = "placement-summary";
	static final int YEARS = 5;
	/** 원문 파일이 없거나 본문 글이 비었을 때 남기는 까닭 */
	static final String NO_TEXT = "NO_TEXT";
	/** 상장사 이름은 이 글자 수 이상만 막는다(두 글자 이름은 흔한 낱말과 겹친다. 그 회사 이름은 길이와 상관없이 막는다) */
	static final int LISTED_NAME_MIN = 3;
	private static final Logger log = LoggerFactory.getLogger(PlacementSummaryJob.class);

	private final DisclosureSource disclosures;
	private final VirtualSimStore store;
	private final MarketService market;
	private final PlacementSummaryWriter writer;
	private final GeminiDailyUsage usage;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public PlacementSummaryJob(DisclosureSource disclosures, VirtualSimStore store, MarketService market, PlacementSummaryWriter writer, GeminiDailyUsage usage,
			IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.disclosures = disclosures;
		this.store = store;
		this.market = market;
		this.writer = writer;
		this.usage = usage;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	/**
	 * 요약할 공시 하나. company: 그 회사 이름(모르면 null), evidence: 반응 창 근거 유형인지, detailed: 공시 주요 내용이 있는지,
	 * correction: 원공시에 합친 정정 공시인지(문제로 나오지 않고 원공시의 요약이 없을 때만 쓰인다)
	 */
	record Target(DisclosureRow disclosure, String company, boolean evidence, boolean detailed, boolean correction) {
	}

	@EventListener(ApplicationReadyEvent.class)
	void onStart() {
		if (props.placementSummary().runOnStart()) {
			runSafely();
		}
	}

	/** 빈 값(.env.example을 복사하고 비워 둔 PLACEMENT_SUMMARY_CRON)도 기본 21:00으로 본다. 빈 cron은 일정 등록이 실패해 worker가 켜지지 않는다 */
	@Scheduled(cron = "#{'${app.ingest.placement-summary.cron:}'.isBlank() ? '0 0 21 * * *' : '${app.ingest.placement-summary.cron:}'}", zone = "Asia/Seoul")
	void scheduled() {
		runSafely();
	}

	private void runSafely() {
		try {
			runOnce();
		}
		catch (RuntimeException e) {
			log.warn("배치고사 공시 AI 요약 실패: {}", e.getMessage());
		}
	}

	public synchronized Run runOnce() {
		if (!writer.enabled()) {
			log.info("배치고사 공시 AI 요약 건너뜀: GEMINI_API_KEY가 비어 있거나 PLACEMENT_SUMMARY_SOURCE=none이에요(문제는 공시 주요 내용·유형 설명으로 나가요)");
			return new Run("SKIPPED", 0, 0, 0, 0, null, false);
		}
		if (!"dart".equals(props.disclosureSource()) || !disclosures.enabled()) {
			log.info("배치고사 공시 AI 요약 건너뜀: DART_API_KEY가 비어 있거나 MARKET_DISCLOSURE_SOURCE가 dart가 아니에요");
			return new Run("SKIPPED", 0, 0, 0, 0, null, false);
		}
		IngestProperties.PlacementSummary o = props.placementSummary();
		List<Target> targets = targets(o.batchSize() * o.maxCalls());
		if (targets.isEmpty()) {
			return new Run("SUCCESS", 0, 0, 0, 0, null, false);
		}
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		int calls = 0, ok = 0, saved = 0, rejected = 0, done = 0;
		extractFailures = 0;
		String error = null;
		boolean failed = false, capped = false, completed = false;
		String status;
		try {
			Set<String> listed = new LinkedHashSet<>();
			disclosures.listedNames().stream().filter(n -> n.strip().length() >= LISTED_NAME_MIN).forEach(listed::add);
			for (int from = 0; from < targets.size(); from += o.batchSize()) {
				List<Target> batch = targets.subList(from, Math.min(targets.size(), from + o.batchSize()));
				List<PlacementSummaryWriter.Input> inputs = new ArrayList<>();
				List<SummaryRow> empty = new ArrayList<>();
				for (Target t : batch) {
					String no = t.disclosure().receiptNo();
					String text;
					try {
						text = disclosures.documentText(no);
					}
					catch (DartException e) {
						if (e.stopsRun()) {
							throw e;
						}
						// 그 공시만의 문제. 요약은 저장하지 않고 실패를 남겨 다음 실행에서 맨 뒤로 미룬다
						extractFailed(no, e);
						continue;
					}
					catch (RuntimeException e) {
						extractFailed(no, e);
						continue;
					}
					if (text == null || text.isBlank()) {
						empty.add(new SummaryRow(no, null, NO_TEXT, null));
						continue;
					}
					Set<String> names = new LinkedHashSet<>(PlacementSummaries.names(text));
					names.addAll(listed);
					if (t.company() != null) {
						names.add(t.company());
					}
					String cut = text.length() > PlacementSummaries.MAX_SOURCE_CHARS ? text.substring(0, PlacementSummaries.MAX_SOURCE_CHARS) : text;
					VirtualSimCategory category = VirtualSimCategory.classify(t.disclosure().title());
					inputs.add(new PlacementSummaryWriter.Input(no, category.displayName(), t.disclosure().title(), cut, names));
				}
				saved += store.saveSummaries(empty);
				done = from + batch.size();
				if (inputs.isEmpty()) {
					continue;
				}
				if (!usage.take(JOB, o.dailyCap())) {
					capped = true;
					done = from;
					break;
				}
				if (calls > 0) {
					pause(props.gemini().callDelay());
				}
				List<PlacementSummaryWriter.Result> results;
				try {
					calls++;
					results = writer.write(inputs);
				}
				catch (RuntimeException e) {
					failed = true;
					error = message(e);
					log.warn("배치고사 공시 AI 요약 멈춤({}번째 호출): {}", calls, error);
					break;
				}
				ok++;
				// 검사에 걸린 요약은 까닭을 붙여 한 번만 다시 쓰게 한다(호출 한 번, 상한 안에서). 다시 쓰기가 실패하면 걸린 공시는 저장하지 않아 다음 실행에 처음부터 한다
				Map<String, PlacementSummaryWriter.Input> byId = new HashMap<>();
				inputs.forEach(in -> byId.put(in.id(), in));
				List<PlacementSummaryWriter.Retry> retries = results.stream().filter(r -> r.summary() == null && r.draft() != null)
					.map(r -> new PlacementSummaryWriter.Retry(byId.get(r.id()), r.draft(), r.problem())).toList();
				if (!retries.isEmpty()) {
					if (calls >= o.maxCalls() || !usage.take(JOB, o.dailyCap())) {
						capped = calls < o.maxCalls();
						saved += save(results.stream().filter(r -> r.summary() != null).toList());
						break;
					}
					pause(props.gemini().callDelay());
					List<PlacementSummaryWriter.Result> again;
					try {
						calls++;
						again = writer.rewrite(retries);
					}
					catch (RuntimeException e) {
						failed = true;
						error = message(e);
						log.warn("배치고사 공시 AI 요약 멈춤({}번째 호출, 다시 쓰기): {}", calls, error);
						saved += save(results.stream().filter(r -> r.summary() != null).toList());
						break;
					}
					// 다시 쓰기 응답에서 빠진 공시는 처음 탈락 결과도 저장하지 않는다(같은 규칙 버전에서 다시 시도되지 않으면 요약 없이 남는다). 다음 실행에 처음부터 한다
					Set<String> retried = new HashSet<>();
					retries.forEach(r -> retried.add(r.input().id()));
					Map<String, PlacementSummaryWriter.Result> merged = new java.util.LinkedHashMap<>();
					results.stream().filter(r -> !retried.contains(r.id())).forEach(r -> merged.put(r.id(), r));
					again.stream().filter(r -> retried.contains(r.id())).forEach(r -> merged.put(r.id(), r));
					results = List.copyOf(merged.values());
				}
				saved += save(results);
				rejected += (int) results.stream().filter(r -> r.summary() == null).count();
				if (calls >= o.maxCalls()) {
					break;
				}
			}
			completed = true;
		}
		catch (RuntimeException e) {
			// 원문 받기의 키·한도 문제, 상장사 이름 목록·하루 호출 수 세기·저장 같은 작성기 밖 실패. 그때까지 넣은 요약은 그대로 두고 남은 공시는 다음 실행에 한다
			failed = true;
			error = message(e);
			log.warn("배치고사 공시 AI 요약 멈춤(작성기 밖 오류): {}", error);
		}
		finally {
			if (!completed && !failed) {
				failed = true;
				error = "요약 단계가 중간에 멈췄어요";
			}
			// 원문 받기 실패가 있으면 성공으로 기록하지 않는다: 아무것도 저장하지 못했으면 FAILED, 일부라도 했으면 PARTIAL
			boolean extractErrors = extractFailures > 0;
			status = failed ? (ok == 0 ? "FAILED" : "PARTIAL")
					: extractErrors ? (ok == 0 && saved == 0 ? "FAILED" : "PARTIAL") : capped && calls == 0 ? "SKIPPED" : "SUCCESS";
			String extractNote = extractErrors ? "원문 받기 " + extractFailures + "건 실패(다음 실행에서 뒤로 미뤄요)" : null;
			String note = failed ? (extractNote == null ? error : error + " / " + extractNote)
					: extractNote != null ? extractNote
					: capped ? "하루 호출 상한 " + o.dailyCap() + "번에 닿아 남은 " + (targets.size() - done) + "건은 다음 날 실행에 만들어요" : null;
			run.finish(status, saved, note, clock.instant());
			runs.save(run);
		}
		log.info("배치고사 공시 AI 요약 끝 {} (대상 {}건, 호출 {}번, 저장 {}건 중 요약 없음 {}건, 오늘 호출 {}/{}번)", status, targets.size(), calls, saved, rejected,
				usage.used(JOB), o.dailyCap());
		return new Run(status, targets.size(), calls, saved, rejected, error, capped);
	}

	/** 이번 실행에서 원문 받기에 실패한 공시 수(runOnce는 synchronized라 실행마다 0부터 센다) */
	private int extractFailures;

	/** 원문 받기 실패: 로그와 실패 기록(V34)을 남겨 다음 실행에서 맨 뒤로 미룬다 */
	private void extractFailed(String receiptNo, RuntimeException e) {
		extractFailures++;
		log.warn("배치고사 공시 원문 받기 실패 {}: {}", receiptNo, e.getMessage());
		store.recordSummaryFailure(receiptNo, message(e));
	}

	/** 결과를 저장한다. 검사에 걸린 공시는 까닭을 로그에 남긴다(이름에 걸린 것은 까닭 이름만, 요약 글은 남기지 않는다) */
	private int save(List<PlacementSummaryWriter.Result> results) {
		for (PlacementSummaryWriter.Result r : results) {
			if (r.summary() == null) {
				log.info("배치고사 공시 AI 요약 검사 탈락 {} {}{}", r.id(), r.reject(), "NAME".equals(r.reject()) || r.problem() == null ? "" : ": " + r.problem());
			}
		}
		return store.saveSummaries(results.stream().map(r -> new SummaryRow(r.id(), r.summary(), r.reject(), writer.model())).toList());
	}

	/**
	 * 대상 공시: 원문 받기에 실패한 적 없는 공시 중 원공시 먼저(정정 공시는 원공시를 다 한 뒤에, Issue #375), 그 안에서 반응 창 근거 유형 먼저, 그다음 주요 내용이 없는 공시,
	 * 같으면 최근 접수부터. 실패한 공시는 맨 뒤. 원공시가 수집 기간 밖이라 합칠 곳이 없는 정정 공시는 문제에 쓰이지 않아 뺀다. limit건
	 */
	List<Target> targets(int limit) {
		LocalDate since = LocalDate.now(clock.withZone(IngestConfig.SEOUL)).minusYears(YEARS);
		Map<String, String> companies = new HashMap<>();
		for (StockRef s : market.rankedStocks()) {
			companies.put(s.code(), s.name());
		}
		Set<String> done = store.summarizedReceipts();
		Map<String, java.time.Instant> failed = store.summaryFailures();
		List<Target> out = new ArrayList<>();
		for (String stock : store.archivedStocks()) {
			Set<String> detailed = store.details(stock).keySet();
			Map<String, DisclosureRow> rows = new HashMap<>();
			store.disclosures(stock).stream().filter(d -> !d.date().isBefore(since)).forEach(d -> rows.put(d.receiptNo(), d));
			List<VirtualContestQuestions.Filing> filings = rows.values().stream().map(d -> new VirtualContestQuestions.Filing(d.receiptNo(), d.title(), d.date())).toList();
			for (VirtualContestQuestions.Merged m : VirtualContestQuestions.merge(filings)) {
				List<VirtualContestQuestions.Filing> members = new ArrayList<>();
				members.add(m.original());
				members.addAll(m.corrections());
				for (VirtualContestQuestions.Filing f : members) {
					DisclosureRow d = rows.get(f.receiptNo());
					if (!done.contains(d.receiptNo())) {
						out.add(new Target(d, companies.get(stock), VirtualContestQuestions.EVIDENCE_TYPES.contains(VirtualSimCategory.classify(d.title())),
								detailed.contains(d.receiptNo()), f != m.original()));
					}
				}
			}
		}
		// 원문 받기에 실패한 적 있는 공시는 맨 뒤로(오래 전에 실패한 순). 같은 공시가 계속 실패해도 뒤의 정상 공시가 막히지 않는다
		out.sort(Comparator.comparing((Target t) -> failed.containsKey(t.disclosure().receiptNo()))
			.thenComparing((Target t) -> failed.getOrDefault(t.disclosure().receiptNo(), java.time.Instant.EPOCH))
			.thenComparing(Target::correction).thenComparing((Target t) -> !t.evidence()).thenComparing(Target::detailed)
			.thenComparing((Target t) -> t.disclosure().receiptNo(), Comparator.reverseOrder()));
		return out.size() > limit ? List.copyOf(out.subList(0, limit)) : out;
	}

	/** ingest_runs.error에 남길 말. 메시지가 비어 있으면 예외 종류 이름 */
	private static String message(RuntimeException e) {
		return e.getMessage() == null || e.getMessage().isBlank() ? e.getClass().getSimpleName() : e.getMessage();
	}

	private static void pause(Duration d) {
		if (d.isZero() || d.isNegative()) {
			return;
		}
		try {
			Thread.sleep(d);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("중단됨", e);
		}
	}

	/** saved: 넣은 행 수(요약 없이 까닭만 남긴 공시 포함), rejected: 검사에 걸린 요약 수, capped: 하루 호출 상한에 닿아 멈췄는지 */
	public record Run(String status, int targets, int calls, int saved, int rejected, String error, boolean capped) {
	}
}
