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
 * 아직 개요가 없거나 입력이 바뀐 최근 3년 사건(마지막 날이 최근인 것부터)을 batchSize건씩 묶어 maxCalls번까지 부른다.
 * 부르기 전마다 하루 호출 상한(dailyCap, DB에 셈)을 확인해 닿으면 멈춘다. worker를 다시 켜도 그날 쓴 수는 남는다. 예시 작성기(fake)는 세지 않는다.
 * 키가 없으면 건너뛰고, 호출이 실패하면(한도 초과 등) 거기서 멈춰 남은 사건은 다음 실행에 한다. 사건·근거는 그대로다.
 * 작성기 밖(DB) 오류로 멈춰도 ingest_runs 행은 FAILED·PARTIAL로 닫는다.
 * 로그에는 건수만 남기고 프롬프트·응답 본문은 남기지 않는다. 결과는 ingest_runs(event-overview)에 남긴다.
 */
@Component
@Profile("worker")
public class EventOverviewJob {

	static final String JOB = "event-overview";
	private static final Logger log = LoggerFactory.getLogger(EventOverviewJob.class);

	private final EventService events;
	private final EventOverviewWriter writer;
	private final GeminiDailyUsage usage;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public EventOverviewJob(EventService events, EventOverviewWriter writer, GeminiDailyUsage usage, IngestProperties props, IngestRunRepository runs,
			Clock clock) {
		this.events = events;
		this.writer = writer;
		this.usage = usage;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	/** waitForEvidence: 공시 소스가 켜져 있으면 true(공시 고유번호가 있는 종목 사건은 근거를 찾은 뒤에 쓴다). */
	public synchronized Run runOnce(boolean waitForEvidence) {
		if (!writer.enabled()) {
			log.info("사건 AI 개요 건너뜀: GEMINI_API_KEY가 비어 있거나 EVENT_OVERVIEW_SOURCE=none이에요(사건 상세는 사실 문장만)");
			return new Run("SKIPPED", 0, 0, 0, 0, null, false);
		}
		IngestProperties.EventOverview o = props.eventOverview();
		List<OverviewTarget> targets = events.overviewTargets(o.batchSize() * o.maxCalls(), waitForEvidence);
		if (targets.isEmpty()) {
			return new Run("SUCCESS", 0, 0, 0, 0, null, false);
		}
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		// 예시 작성기(fake)는 Gemini를 부르지 않으므로 하루 호출 수에 세지 않는다(같은 DB의 실제 Gemini 상한을 먼저 쓰지 않게)
		boolean counted = !writer.sample();
		int calls = 0, ok = 0, saved = 0, rejected = 0, done = 0;
		String error = null;
		boolean failed = false, capped = false, completed = false;
		String status;
		try {
			for (int from = 0; from < targets.size(); from += o.batchSize()) {
				if (counted && !usage.take(JOB, o.dailyCap())) {
					capped = true;
					break;
				}
				if (calls > 0) {
					pause(props.gemini().callDelay());
				}
				List<OverviewTarget> batch = targets.subList(from, Math.min(targets.size(), from + o.batchSize()));
				done = from + batch.size();
				List<OverviewResult> results;
				try {
					calls++;
					results = writer.write(batch);
				}
				catch (RuntimeException e) {
					failed = true;
					error = message(e);
					log.warn("사건 AI 개요 멈춤({}번째 호출): {}", calls, error);
					break;
				}
				saved += events.applyOverviews(results);
				rejected += (int) results.stream().filter(r -> r.summary() == null).count();
				ok++;
			}
			completed = true;
		}
		catch (RuntimeException e) {
			// 작성기 밖(하루 호출 수 세기·개요 저장 등 DB) 실패. 그때까지 넣은 개요는 그대로 두고 남은 사건은 다음 실행에 한다
			failed = true;
			error = message(e);
			log.warn("사건 AI 개요 멈춤(작성기 밖 오류): {}", error);
		}
		finally {
			// 어떤 예외로 끝나도 ingest_runs 행이 RUNNING으로 남지 않게 닫는다(RuntimeException 밖의 오류는 닫은 뒤 그대로 던진다)
			if (!completed && !failed) {
				failed = true;
				error = "개요 단계가 중간에 멈췄어요";
			}
			status = failed ? (ok == 0 ? "FAILED" : "PARTIAL") : capped && calls == 0 ? "SKIPPED" : "SUCCESS";
			String note = failed ? error
					: capped ? "하루 호출 상한 " + o.dailyCap() + "번에 닿아 남은 " + (targets.size() - done) + "건은 다음 날 실행에 만들어요" : null;
			run.finish(status, saved, note, clock.instant());
			runs.save(run);
		}
		log.info("사건 AI 개요 끝 {} (대상 {}건, 호출 {}번, 저장 {}건 중 검사 탈락 {}건, 오늘 호출 {}/{}번)", status, targets.size(), calls, saved, rejected,
				usage.used(JOB), o.dailyCap());
		return new Run(status, targets.size(), calls, saved, rejected, error, capped);
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

	/** saved: 넣은 결과 수(검사에서 버려 문장 없이 지문만 남긴 rejected 포함), capped: 하루 호출 상한에 닿아 멈췄는지 */
	public record Run(String status, int targets, int calls, int saved, int rejected, String error, boolean capped) {
	}
}
