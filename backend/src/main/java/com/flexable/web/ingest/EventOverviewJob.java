package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;

import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;
import com.flexable.web.market.EventService;

/**
 * 사건 AI 개요 단계(worker, decisions/2026-10-29-event-ai-summary). MarketEventJob이 사건 탐지·공시 근거 수집 뒤에 부른다.
 * 아직 개요가 없거나 입력이 바뀐 사건(마지막 날이 최근인 것부터)을 batchSize건씩 묶어 maxCalls번까지 부른다.
 * 키가 없으면 건너뛰고, 호출이 실패하면(한도 초과 등) 거기서 멈춰 남은 사건은 다음 실행에 한다. 사건·근거는 그대로다.
 * 로그에는 건수만 남기고 프롬프트·응답 본문은 남기지 않는다. 결과는 ingest_runs(event-overview)에 남긴다.
 */
@Component
@Profile("worker")
public class EventOverviewJob {

	static final String JOB = "event-overview";
	private static final Logger log = LoggerFactory.getLogger(EventOverviewJob.class);

	private final EventService events;
	private final EventOverviewWriter writer;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public EventOverviewJob(EventService events, EventOverviewWriter writer, IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.events = events;
		this.writer = writer;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	/** waitForEvidence: 공시 소스가 켜져 있으면 true(공시 고유번호가 있는 종목 사건은 근거를 찾은 뒤에 쓴다). */
	public synchronized Run runOnce(boolean waitForEvidence) {
		if (!writer.enabled()) {
			log.info("사건 AI 개요 건너뜀: GEMINI_API_KEY가 비어 있거나 EVENT_OVERVIEW_SOURCE=none이에요(사건 상세는 사실 문장만)");
			return new Run("SKIPPED", 0, 0, 0, 0, null);
		}
		IngestProperties.EventOverview o = props.eventOverview();
		List<OverviewTarget> targets = events.overviewTargets(o.batchSize() * o.maxCalls(), waitForEvidence);
		if (targets.isEmpty()) {
			return new Run("SUCCESS", 0, 0, 0, 0, null);
		}
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		int calls = 0, saved = 0, rejected = 0;
		String error = null;
		for (int from = 0; from < targets.size(); from += o.batchSize()) {
			if (calls > 0) {
				pause(props.gemini().callDelay());
			}
			List<OverviewTarget> batch = targets.subList(from, Math.min(targets.size(), from + o.batchSize()));
			List<OverviewResult> results;
			try {
				calls++;
				results = writer.write(batch);
			}
			catch (RuntimeException e) {
				error = e.getMessage();
				log.warn("사건 AI 개요 멈춤({}번째 호출): {}", calls, e.getMessage());
				break;
			}
			saved += events.applyOverviews(results);
			rejected += (int) results.stream().filter(r -> r.summary() == null).count();
		}
		String status = error == null ? "SUCCESS" : calls == 1 ? "FAILED" : "PARTIAL";
		run.finish(status, saved, error, clock.instant());
		runs.save(run);
		log.info("사건 AI 개요 끝 {} (대상 {}건, 호출 {}번, 저장 {}건 중 검사 탈락 {}건)", status, targets.size(), calls, saved, rejected);
		return new Run(status, targets.size(), calls, saved, rejected, error);
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

	/** saved: 넣은 결과 수(검사에서 버려 문장 없이 지문만 남긴 rejected 포함) */
	public record Run(String status, int targets, int calls, int saved, int rejected, String error) {
	}
}
