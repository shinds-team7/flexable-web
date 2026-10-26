package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.ApplicationArguments;
import org.springframework.boot.ApplicationRunner;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flexable.web.news.NewsDtos.PolicyDraft;
import com.flexable.web.news.NewsDtos.SaveOutcome;
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;
import com.flexable.web.news.NewsService;

/**
 * 청년 정책 수집(worker, 03 §5-7 youth-collect). 정책 목록을 받아 원문과 카드(DRAFT)로 저장하고, 이어서 요약 단계(youth-summary)를 돈다.
 * 카드는 사람 검수 없이 화면에 나간다(2026-10-26 결정). 키가 없으면 호출하지 않고 실행 기록에 남긴다(서버는 계속 돈다).
 * 요약은 Gemini로 아직 요약하지 않았거나 원문이 바뀐 카드만 묶어서 한다. 요약이 실패해도 수집 결과는 그대로다.
 * 한 건이 실패해도 나머지는 계속하고, 실행 결과는 ingest_runs에 남긴다.
 */
@Component
@Profile("worker")
public class YouthNewsSyncJob implements ApplicationRunner {

	static final String JOB = "youth-collect";
	static final String SUMMARY_JOB = "youth-summary";
	private static final Logger log = LoggerFactory.getLogger(YouthNewsSyncJob.class);

	private final YouthPolicySource source;
	private final NewsService news;
	private final NewsSummarizer summarizer;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public YouthNewsSyncJob(YouthPolicySource source, NewsService news, NewsSummarizer summarizer, IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.source = source;
		this.news = news;
		this.summarizer = summarizer;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	@Override
	public void run(ApplicationArguments args) {
		if (props.youth().runOnStart()) {
			runOnce();
		}
	}

	/** 매일 아침(03 §5-7: 06:00 수집). */
	@Scheduled(cron = "${app.ingest.youth.cron:0 0 6 * * *}", zone = "Asia/Seoul")
	void scheduled() {
		runOnce();
	}

	public synchronized Result runOnce() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		if (!source.enabled()) {
			run.finish("FAILED", 0, "키 없음: YOUTHCENTER_API_KEY를 넣으면 수집해요", clock.instant());
			runs.save(run);
			log.warn("청년 정책 수집 건너뜀: YOUTHCENTER_API_KEY가 비어 있어요");
			return new Result("FAILED", Map.of(), List.of("키 없음"));
		}
		List<PolicyDraft> policies;
		try {
			policies = source.policies();
		}
		catch (RuntimeException e) {
			run.finish("FAILED", 0, e.getMessage(), clock.instant());
			runs.save(run);
			log.warn("청년 정책 목록 실패: {}", e.getMessage());
			return new Result("FAILED", Map.of(), List.of(String.valueOf(e.getMessage())));
		}
		Map<SaveOutcome, Integer> counts = new EnumMap<>(SaveOutcome.class);
		List<String> errors = new ArrayList<>();
		for (PolicyDraft p : policies) {
			try {
				counts.merge(news.saveCollected(p), 1, Integer::sum);
			}
			catch (RuntimeException e) {
				errors.add(p.externalId() + ": " + e.getMessage());
				log.warn("청년 정책 저장 실패 {}: {}", p.externalId(), e.getMessage());
			}
		}
		int changed = counts.getOrDefault(SaveOutcome.CREATED, 0) + counts.getOrDefault(SaveOutcome.UPDATED, 0)
				+ counts.getOrDefault(SaveOutcome.KEPT, 0);
		String status = errors.isEmpty() ? "SUCCESS" : errors.size() == policies.size() ? "FAILED" : "PARTIAL";
		run.finish(status, changed, errors.isEmpty() ? null : errors.size() + "건 실패: " + String.join(" / ", errors), clock.instant());
		runs.save(run);
		log.info("청년 정책 수집 끝 {} ({} {}건, {}, 실패 {}건)", status, source.source(), policies.size(), counts, errors.size());
		if (!"FAILED".equals(status)) {
			summarize();
		}
		return new Result(status, counts, errors);
	}

	/**
	 * 요약 단계. 대상(요약 없음·원문 바뀜, 마감 임박순)을 batchSize건씩 묶어 maxCalls번까지 부른다.
	 * 호출이 실패하면(한도 초과 등) 거기서 멈추고 남은 카드는 다음 실행에 한다. 결과는 ingest_runs(youth-summary)에 남긴다.
	 */
	public synchronized SummaryRun summarize() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		if (!summarizer.enabled()) {
			log.info("청년 소식 요약 건너뜀: GEMINI_API_KEY가 비어 있어요(소식은 요약 없이 나가요)");
			return new SummaryRun("SKIPPED", 0, 0, 0, null);
		}
		IngestProperties.Gemini g = props.gemini();
		List<SummaryTarget> targets = news.summaryTargets(g.batchSize() * g.maxCalls());
		IngestRun run = runs.save(new IngestRun(SUMMARY_JOB, today, clock.instant()));
		int calls = 0, saved = 0, rejected = 0;
		String error = null;
		for (int from = 0; from < targets.size(); from += g.batchSize()) {
			if (calls > 0) {
				pause(g.callDelay());
			}
			List<SummaryTarget> batch = targets.subList(from, Math.min(targets.size(), from + g.batchSize()));
			List<SummaryResult> results;
			try {
				calls++;
				results = summarizer.summarize(batch);
			}
			catch (RuntimeException e) {
				error = e.getMessage();
				log.warn("청년 소식 요약 멈춤({}번째 호출): {}", calls, e.getMessage());
				break;
			}
			saved += news.applySummaries(results);
			rejected += (int) results.stream().filter(r -> r.summary() == null).count();
		}
		String status = error == null ? "SUCCESS" : calls == 1 ? "FAILED" : "PARTIAL";
		run.finish(status, saved, error, clock.instant());
		runs.save(run);
		log.info("청년 소식 요약 끝 {} (대상 {}건, 호출 {}번, 저장 {}건 중 검사 탈락 {}건)", status, targets.size(), calls, saved, rejected);
		return new SummaryRun(status, targets.size(), calls, saved, error);
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

	/** saved: 넣은 결과 수(검사에서 버려 요약 없이 표시한 건 포함) */
	public record SummaryRun(String status, int targets, int calls, int saved, String error) {
	}

	public record Result(String status, Map<SaveOutcome, Integer> counts, List<String> errors) {
	}
}
