package com.flexable.web.ingest;

import java.time.Clock;
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
import com.flexable.web.news.NewsService;

/**
 * 청년 정책 수집(worker, 03 §5-7 youth-collect). 정책 목록을 받아 원문과 카드 초안(DRAFT)으로 저장한다.
 * 화면에는 사람이 승인한 소식만 나간다. 키가 없으면 호출하지 않고 실행 기록에 남긴다(서버는 계속 돈다).
 * 한 건이 실패해도 나머지는 계속하고, 실행 결과는 ingest_runs에 남긴다.
 */
@Component
@Profile("worker")
public class YouthNewsSyncJob implements ApplicationRunner {

	static final String JOB = "youth-collect";
	private static final Logger log = LoggerFactory.getLogger(YouthNewsSyncJob.class);

	private final YouthPolicySource source;
	private final NewsService news;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public YouthNewsSyncJob(YouthPolicySource source, NewsService news, IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.source = source;
		this.news = news;
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
		return new Result(status, counts, errors);
	}

	public record Result(String status, Map<SaveOutcome, Integer> counts, List<String> errors) {
	}
}
