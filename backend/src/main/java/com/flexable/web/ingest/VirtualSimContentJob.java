package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeMap;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Profile;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Component;

import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimChecker;
import com.flexable.web.virtualsim.VirtualSimChecker.Field;
import com.flexable.web.virtualsim.VirtualSimChecker.Reason;
import com.flexable.web.virtualsim.VirtualSimRuleset;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;
import com.flexable.web.virtualsim.VirtualSimSample;
import com.flexable.web.virtualsim.VirtualSimSample.Draft;
import com.flexable.web.virtualsim.VirtualSimStore;

/**
 * 가상 회사·사건 글 생성(worker, decisions/2026-11-04-virtual-simulation 4·5). 매일 07:00 KST와 worker 시작 때 한 번 돈다.
 * 회사 batchSize곳을 한 번에 부르고 한 번 실행에 maxCalls번까지(기본 5곳 × 2번). 부르기 전마다 하루 호출 상한(dailyCap, gemini_daily_usage virtual-sim)을 확인한다.
 * 자동 검사(vsim-check-v3)를 통과한 글만 저장하고, 탈락하면 다시 부르지 않는다. 키 없음·none·호출 실패·하루 상한·상장사 이름 목록을 못 받음이면
 * 생성 단계만 멈추고 이미 쌓인 회사·룰셋은 그대로다(ingest_runs virtual-sim). 로그에는 건수·탈락 사유별 수·소요 시간만 남긴다.
 * 예시 작성기(fake)는 예시 룰셋으로 예시 회사 6곳을 한 번만 만들고 하루 호출 수에 세지 않는다.
 */
@Component
@Profile("worker")
public class VirtualSimContentJob {

	static final String JOB = "virtual-sim";
	/** 업종 목록(vsim-industries-v1). 서버가 골라 입력으로 준다 */
	static final List<String> INDUSTRIES = List.of("반도체 장비", "2차전지 소재", "바이오 의약품", "게임", "화장품", "식품", "조선 부품", "로봇", "클라우드 소프트웨어", "물류",
			"건설 자재", "엔터테인먼트");
	private static final Logger log = LoggerFactory.getLogger(VirtualSimContentJob.class);

	private final VirtualSimWriter writer;
	private final VirtualSimStore store;
	private final MarketService market;
	private final DisclosureSource disclosures;
	private final GeminiDailyUsage usage;
	private final IngestProperties props;
	private final IngestRunRepository runs;
	private final Clock clock;

	public VirtualSimContentJob(VirtualSimWriter writer, VirtualSimStore store, MarketService market, DisclosureSource disclosures, GeminiDailyUsage usage,
			IngestProperties props, IngestRunRepository runs, Clock clock) {
		this.writer = writer;
		this.store = store;
		this.market = market;
		this.disclosures = disclosures;
		this.usage = usage;
		this.props = props;
		this.runs = runs;
		this.clock = clock;
	}

	@EventListener(ApplicationReadyEvent.class)
	void onStart() {
		if (props.runOnStart()) {
			runSafely();
		}
	}

	@Scheduled(cron = "${app.ingest.virtual-sim.cron:0 0 7 * * *}", zone = "Asia/Seoul")
	void scheduled() {
		runSafely();
	}

	private void runSafely() {
		try {
			runOnce();
		}
		catch (RuntimeException e) {
			log.warn("가상 시뮬레이션 글 생성 실패: {}", e.getMessage());
		}
	}

	public synchronized Run runOnce() {
		if (!writer.enabled()) {
			log.info("가상 시뮬레이션 글 생성 건너뜀: 키가 비어 있거나 VIRTUAL_SIM_SOURCE=none이에요(이미 만든 회사로 세션은 계속돼요)");
			return Run.skipped("작성기가 꺼져 있어요");
		}
		boolean sample = writer.sample();
		if (sample && store.countCompanies(true, VirtualSimChecker.VERSION) >= VirtualSimSample.companies().size()) {
			return Run.skipped("예시 회사가 이미 있어요");
		}
		VirtualSimRuleset rules = sample ? VirtualSimSample.ruleset() : store.latestRuleset(false).orElse(null);
		if (rules == null) {
			log.info("가상 시뮬레이션 글 생성 건너뜀: 룰셋이 아직 없어요(전체 공시를 다 받으면 만들어져요)");
			return Run.skipped("룰셋이 아직 없어요");
		}
		List<VirtualSimCategory> categories = rules.categories().stream().map(CategoryStats::category).sorted().toList();
		IngestProperties.VirtualSim o = props.virtualSim();
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		Instant started = clock.instant();
		IngestRun run = runs.save(new IngestRun(JOB, today, started));
		int calls = 0, ok = 0, saved = 0;
		Map<String, Integer> rejected = new TreeMap<>();
		String error = null;
		boolean failed = false, capped = false, completed = false;
		String status;
		try {
			Set<String> names = new HashSet<>(market.instrumentNames());
			if (!sample) {
				// 실제 상장사 이름과 대조할 수 없으면 Gemini 글을 만들지 않는다
				try {
					names.addAll(disclosures.listedNames());
				}
				catch (RuntimeException e) {
					throw new IllegalStateException("상장사 이름 목록을 받지 못해 생성하지 않았어요: " + e.getMessage(), e);
				}
			}
			VirtualSimChecker checker = new VirtualSimChecker(names, store.companyNames(VirtualSimChecker.VERSION));
			Map<String, Integer> industries = new TreeMap<>(store.industryCounts(sample));
			int maxCalls = sample ? 1 : o.maxCalls();
			int batchSize = sample ? VirtualSimSample.companies().size() : o.batchSize();
			int nextId = 0;
			for (; calls < maxCalls;) {
				if (!sample && !usage.take(JOB, o.dailyCap())) {
					capped = true;
					break;
				}
				if (calls > 0) {
					pause(props.gemini().callDelay());
				}
				List<VirtualSimWriter.Request> batch = new ArrayList<>();
				for (int k = 0; k < batchSize; k++) {
					String industry = INDUSTRIES.stream().min(Comparator.comparingInt((String i) -> industries.getOrDefault(i, 0))).orElseThrow();
					industries.merge(industry, 1, Integer::sum);
					batch.add(new VirtualSimWriter.Request(nextId++, industry, categories));
				}
				List<VirtualSimWriter.Written> written;
				try {
					calls++;
					written = writer.write(batch);
				}
				catch (RuntimeException e) {
					failed = true;
					error = message(e);
					log.warn("가상 시뮬레이션 글 생성 멈춤({}번째 호출): {}", calls, error);
					break;
				}
				for (VirtualSimWriter.Written w : written) {
					Draft d = checked(w.draft(), checker, rejected);
					if (d != null) {
						store.saveCompany(d, writer.model(), writer.promptVersion(), VirtualSimChecker.VERSION, sample, clock.instant());
						checker.reserve(d.name());
						saved++;
					}
				}
				rejected.merge("NO_REPLY", batch.size() - written.size(), Integer::sum);
				rejected.remove("NO_REPLY", 0);
				ok++;
			}
			completed = true;
		}
		catch (RuntimeException e) {
			failed = true;
			error = message(e);
			log.warn("가상 시뮬레이션 글 생성 멈춤: {}", error);
		}
		finally {
			if (!completed && !failed) {
				failed = true;
				error = "생성 단계가 중간에 멈췄어요";
			}
			status = failed ? (ok == 0 ? "FAILED" : "PARTIAL") : capped && calls == 0 ? "SKIPPED" : "SUCCESS";
			String note = failed ? error : capped ? "하루 호출 상한 " + o.dailyCap() + "번에 닿아 남은 생성은 다음 날 실행에 해요" : null;
			run.finish(status, saved, note, clock.instant());
			runs.save(run);
		}
		log.info("가상 시뮬레이션 글 생성 끝 {} (호출 {}번, 저장 {}곳, 탈락 {}, 오늘 호출 {}/{}번, {}초)", status, calls, saved, rejected,
				sample ? 0 : usage.used(JOB), o.dailyCap(), Duration.between(started, clock.instant()).toSeconds());
		return new Run(status, calls, saved, Map.copyOf(rejected), error, capped);
	}

	/**
	 * 회사명·소개가 탈락하면 회사 전체를, 사건 하나가 탈락하면 그 사건만 버린다(탈락 사유를 센다: 회사는 COMPANY_사유, 사건은 EVENT_사유).
	 * 사건이 하나도 남지 않으면 회사도 버린다. 사건 3개·뚜렷한 유형 2개 조건은 세션 후보를 고를 때 지금 룰셋으로 본다.
	 */
	static Draft checked(Draft d, VirtualSimChecker checker, Map<String, Integer> rejected) {
		Reason name = checker.check(Field.NAME, d.name());
		Reason intro = name == Reason.PASS ? checker.check(Field.INTRO, d.intro()) : name;
		if (intro != Reason.PASS) {
			rejected.merge("COMPANY_" + intro, 1, Integer::sum);
			return null;
		}
		Map<VirtualSimCategory, String> bodies = new EnumMap<>(VirtualSimCategory.class);
		d.bodies().forEach((c, body) -> {
			Reason r = checker.check(Field.BODY, body, c);
			if (r == Reason.PASS) {
				bodies.put(c, body.strip());
			}
			else {
				rejected.merge("EVENT_" + r, 1, Integer::sum);
			}
		});
		if (bodies.isEmpty()) {
			rejected.merge("COMPANY_NO_EVENTS", 1, Integer::sum);
			return null;
		}
		return new Draft(d.name().strip(), d.industry(), d.intro().strip(), bodies);
	}

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

	/** saved: 저장한 회사 수, rejected: 탈락 사유별 수(COMPANY_*·EVENT_*·NO_REPLY), capped: 하루 호출 상한에 닿아 멈췄는지 */
	public record Run(String status, int calls, int saved, Map<String, Integer> rejected, String error, boolean capped) {
		static Run skipped(String why) {
			return new Run("SKIPPED", 0, 0, Map.of(), why, false);
		}
	}
}
