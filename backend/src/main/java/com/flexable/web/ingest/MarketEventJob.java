package com.flexable.web.ingest;

import java.time.Clock;
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
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventDtos.PendingEvidence;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketService;

/**
 * 급변동 사건 탐지와 근거 공시 수집(worker, 03 §5-3·5-4). 시세 수집(MarketSyncJob)이 끝난 뒤 돈다.
 * 1) 시장 대용 종목(시장 사건)과 상위 목록 종목마다 저장된 일봉으로 사건을 다시 찾고
 * 2) 공시 소스가 켜져 있으면 고유번호를 채운 뒤, 근거를 아직 찾지 않은 종목 사건의 공시를 받아 점수 상위 5건을 붙인다(임원 지분 보고는 뺀다).
 * 3) 아직 개요가 없거나 입력이 바뀐 사건의 AI 개요를 쓴다(EventOverviewJob, 따로 ingest_runs event-overview에 남긴다).
 * 한 종목·한 사건이 실패해도 나머지는 계속하고, 키 문제·한도 초과면 공시 단계만 멈춘다. 결과는 ingest_runs에 남긴다.
 */
@Component
@Profile("worker")
public class MarketEventJob {

	static final String JOB = "market-events";
	static final String DART = "DART";
	static final int SOURCES_PER_EVENT = 5;
	private static final Logger log = LoggerFactory.getLogger(MarketEventJob.class);

	private final EventService events;
	private final MarketService market;
	private final DisclosureSource disclosures;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;
	private final EventOverviewJob overviews;

	public MarketEventJob(EventService events, MarketService market, DisclosureSource disclosures, IngestProperties props,
			IngestRunRepository runs, Clock clock, EventOverviewJob overviews) {
		this.events = events;
		this.market = market;
		this.disclosures = disclosures;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
		this.overviews = overviews;
	}

	public synchronized Result runOnce() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		IngestRun run = runs.save(new IngestRun(JOB, today, clock.instant()));
		List<String> errors = new ArrayList<>();

		// 시장 대용 종목을 먼저: 상위 목록에 없어도 시장 사건은 찾는다
		Set<String> codes = new LinkedHashSet<>();
		codes.add(events.indexProxy());
		codes.addAll(market.rankedCodes());
		int detected = 0;
		for (String code : codes) {
			try {
				detected += events.detect(code).saved();
			}
			catch (RuntimeException e) {
				errors.add(code + " 탐지: " + e.getMessage());
				log.warn("사건 탐지 실패 {}: {}", code, e.getMessage());
			}
		}
		log.info("사건 탐지 {}종목, 사건 {}건", codes.size(), detected);

		int evidence = 0;
		if (!disclosures.enabled()) {
			log.info("공시 소스가 꺼져 있어(키 없음) 근거 수집을 건너뛰어요");
		}
		else {
			evidence = collectEvidence(errors);
		}

		String status = errors.isEmpty() ? "SUCCESS" : detected == 0 && evidence == 0 ? "FAILED" : "PARTIAL";
		run.finish(status, detected + evidence, errors.isEmpty() ? null : errors.size() + "건 실패: " + String.join(" / ", errors),
				clock.instant());
		runs.save(run);
		log.info("사건 작업 끝 {} (사건 {}건, 근거 확인 {}건, 실패 {}건)", status, detected, evidence, errors.size());

		// 개요는 사건·근거 결과와 따로 남긴다. 실패해도 사건 상세는 사실 문장만으로 그대로 나간다
		EventOverviewJob.Run overview;
		try {
			overview = overviews.runOnce(disclosures.enabled());
		}
		catch (RuntimeException e) {
			log.warn("사건 AI 개요 실패: {}", e.getMessage());
			overview = new EventOverviewJob.Run("FAILED", 0, 0, 0, 0, e.getMessage());
		}
		return new Result(status, detected, evidence, errors, overview);
	}

	/** 근거를 찾은 사건 수를 돌려준다. */
	private int collectEvidence(List<String> errors) {
		try {
			List<String> missing = market.stockCodesWithoutCorpCode();
			if (!missing.isEmpty()) {
				Map<String, String> all = disclosures.corpCodes();
				Map<String, String> found = new HashMap<>();
				missing.forEach(c -> {
					if (all.containsKey(c)) {
						found.put(c, all.get(c));
					}
				});
				int n = market.setCorpCodes(found);
				log.info("공시 고유번호 {}종목 채움(못 찾음 {})", n, missing.size() - found.size());
			}
		}
		catch (RuntimeException e) {
			errors.add("공시 고유번호: " + e.getMessage());
			log.warn("공시 고유번호 실패: {}", e.getMessage());
		}

		List<PendingEvidence> pending = events.pendingEvidence(props.dart().maxCalls());
		int done = 0;
		for (PendingEvidence p : pending) {
			try {
				List<EvidenceRow> rows = disclosures.disclosures(p.corpCode(), p.from(), p.to()).stream()
					.map(d -> new EvidenceRow(DART, d.receiptNo(), d.reportName(), d.filer(), d.date(), disclosures.url(d),
							DisclosureKeywords.weight(d.reportName())))
					.filter(r -> r.weight() != DisclosureKeywords.SKIP)
					.sorted(Comparator.comparingInt(EvidenceRow::weight).reversed().thenComparing(EvidenceRow::date, Comparator.reverseOrder()))
					.limit(SOURCES_PER_EVENT)
					.toList();
				events.saveEvidence(p.eventId(), DART, rows);
				done++;
			}
			catch (DartException e) {
				errors.add(p.code() + " 공시: " + e.getMessage());
				log.warn("공시 실패 {} {}~{}: {}", p.code(), p.from(), p.to(), e.getMessage());
				if (e.stopsRun()) {
					log.warn("공시 단계를 멈춰요(남은 {}건은 다음 실행에)", pending.size() - done);
					break;
				}
			}
			catch (RuntimeException e) {
				errors.add(p.code() + " 공시: " + e.getMessage());
				log.warn("공시 실패 {} {}~{}: {}", p.code(), p.from(), p.to(), e.getMessage());
			}
			if (done > 0 && done % 100 == 0) {
				log.info("공시 근거 {}/{}건", done, pending.size());
			}
		}
		return done;
	}

	public record Result(String status, int events, int evidenceChecked, List<String> errors, EventOverviewJob.Run overview) {
	}
}
