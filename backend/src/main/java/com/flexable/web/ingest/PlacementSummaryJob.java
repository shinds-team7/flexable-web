package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.ingest.dart.DartDisclosureSource.DartException;
import com.flexable.web.market.MarketDtos.StockRef;
import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.PlacementSummaries;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;
import com.flexable.web.virtualsim.VirtualSimStore.SummaryRow;

/**
 * 배치고사 공시 AI 요약(worker, decisions/2026-11-09-placement-ai-summary, policies §8-8 "공시 AI 요약"). 공시 주요 내용 수집(DisclosureDetailJob) 뒤 돈다.
 * 대상은 배치고사 후보가 될 수 있는 공시(공시 목록을 다 받은 종목의 최근 5년 공시 중 유형으로 분류되는 것)이고, 지금 작성 규칙 버전으로 만들지 않았고 숨기지 않은 것만이다.
 * 공시 주요 내용이 없는 공시를 먼저, 그 안에서는 최근 공시부터 batchSize건씩 묶는다. 묶음마다 OpenDART 공시서류원본파일을 공시마다 한 번 받아 본문 글을 뽑고,
 * 부르기 전마다 하루(KST) Gemini 호출 상한(dailyCap, gemini_daily_usage)을 확인한 뒤 한 번 부른다. 한 번 실행에 maxCalls번까지다.
 * 검사에 걸린 요약은 까닭을 붙여 한 번 더 부르고(다시 쓰기, 하루 상한에 함께 센다), 그래도 걸리면 요약 없이 까닭만 남긴다. 원문이 없는 공시도 까닭만 남긴다.
 * 같은 입력(같은 작성 규칙 버전)은 다시 부르지 않는다. 검사를 통과한 요약만 저장하고 원문·본문 글은 저장하지 않는다.
 * 키가 없거나 호출이 실패하면 거기서 멈추고 남은 공시는 다음 실행에 한다. 출제·채점은 요약 없이 그대로다.
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

	/** 요약할 공시 하나. company: 그 회사 이름(모르면 null), detailed: 공시 주요 내용이 있는지 */
	record Target(DisclosureRow disclosure, String company, boolean detailed) {
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
						// 그 공시만의 문제. 저장하지 않아 다음 실행에 다시 받는다
						log.warn("배치고사 공시 원문 받기 실패 {}: {}", no, e.getMessage());
						continue;
					}
					catch (RuntimeException e) {
						log.warn("배치고사 공시 원문 받기 실패 {}: {}", no, e.getMessage());
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
					Map<String, PlacementSummaryWriter.Result> merged = new java.util.LinkedHashMap<>();
					results.forEach(r -> merged.put(r.id(), r));
					again.forEach(r -> merged.put(r.id(), r));
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
			status = failed ? (ok == 0 ? "FAILED" : "PARTIAL") : capped && calls == 0 ? "SKIPPED" : "SUCCESS";
			String note = failed ? error
					: capped ? "하루 호출 상한 " + o.dailyCap() + "번에 닿아 남은 " + (targets.size() - done) + "건은 다음 날 실행에 만들어요" : null;
			run.finish(status, saved, note, clock.instant());
			runs.save(run);
		}
		log.info("배치고사 공시 AI 요약 끝 {} (대상 {}건, 호출 {}번, 저장 {}건 중 요약 없음 {}건, 오늘 호출 {}/{}번)", status, targets.size(), calls, saved, rejected,
				usage.used(JOB), o.dailyCap());
		return new Run(status, targets.size(), calls, saved, rejected, error, capped);
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

	/** 대상 공시: 주요 내용이 없는 공시 먼저, 같으면 최근 접수부터 limit건 */
	List<Target> targets(int limit) {
		LocalDate since = LocalDate.now(clock.withZone(IngestConfig.SEOUL)).minusYears(YEARS);
		Map<String, String> companies = new HashMap<>();
		for (StockRef s : market.rankedStocks()) {
			companies.put(s.code(), s.name());
		}
		Set<String> done = store.summarizedReceipts();
		List<Target> out = new ArrayList<>();
		for (String stock : store.archivedStocks()) {
			Set<String> detailed = store.details(stock).keySet();
			for (DisclosureRow d : store.disclosures(stock)) {
				if (!d.date().isBefore(since) && VirtualSimCategory.classify(d.title()) != null && !done.contains(d.receiptNo())) {
					out.add(new Target(d, companies.get(stock), detailed.contains(d.receiptNo())));
				}
			}
		}
		out.sort(Comparator.comparing(Target::detailed).thenComparing((Target t) -> t.disclosure().receiptNo(), Comparator.reverseOrder()));
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
