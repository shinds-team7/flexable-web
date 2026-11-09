package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.Duration;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.ingest.fake.FakeDisclosureSource;
import com.flexable.web.ingest.fake.FakeVirtualSimWriter;
import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimChecker;
import com.flexable.web.virtualsim.VirtualSimRuleset;
import com.flexable.web.virtualsim.VirtualSimSample;
import com.flexable.web.virtualsim.VirtualSimSample.Draft;
import com.flexable.web.virtualsim.VirtualSimStore;

/**
 * 가상 회사·사건 글 생성 단계(decisions/2026-11-04-virtual-simulation 4·5). 작성기를 바꿔 끼워 키 없음·호출 실패·하루 상한·검사 탈락·상장사 이름 목록 실패를 본다(외부 호출 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:virtual-sim-content;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class VirtualSimContentJobTest {

	@Autowired
	VirtualSimStore store;

	@Autowired
	MarketService market;

	@Autowired
	GeminiDailyUsage usage;

	@Autowired
	IngestProperties props;

	@Autowired
	IngestRunRepository runs;

	@Autowired
	Clock clock;

	@Autowired
	JdbcTemplate jdbc;

	@BeforeEach
	void clear() {
		jdbc.update("DELETE FROM virtual_sim_events");
		jdbc.update("DELETE FROM virtual_sim_companies");
		jdbc.update("DELETE FROM virtual_sim_rulesets");
		jdbc.update("DELETE FROM gemini_daily_usage");
	}

	/** 실제 모드 설정: 호출 간격 0, 상한은 인자로 */
	private IngestProperties props(int batchSize, int maxCalls, int dailyCap) {
		var g = props.gemini();
		return new IngestProperties(props.priceSource(), props.instrumentSource(), props.instrumentFallback(), props.backfillYears(), props.recheckDays(),
				false, props.kiwoom(), props.krx(), props.disclosureSource(), props.dart(), props.youth(),
				new IngestProperties.Gemini(g.baseUrl(), g.apiKey(), g.model(), g.batchSize(), g.maxCalls(), Duration.ZERO), props.eventOverview(),
				new IngestProperties.VirtualSim("gemini", null, null, batchSize, maxCalls, dailyCap, 2000), props.placementSummary());
	}

	private VirtualSimContentJob job(VirtualSimWriter writer, DisclosureSource disclosures, IngestProperties p) {
		return new VirtualSimContentJob(writer, store, market, disclosures, usage, p, runs, clock);
	}

	/** 실제(isSample=false) 룰셋. 예시 룰셋 값을 실제로 둔 것(테스트용) */
	private void realRuleset() {
		VirtualSimRuleset s = VirtualSimSample.ruleset();
		store.saveRuleset(new VirtualSimRuleset(s.version(), "2021-11-04", "2026-11-03", false, List.of("테스트"), s.categories(), s.grades()));
	}

	private static VirtualSimWriter gemini() {
		VirtualSimWriter w = mock(VirtualSimWriter.class);
		when(w.enabled()).thenReturn(true);
		when(w.model()).thenReturn("gemini-test");
		when(w.promptVersion()).thenReturn("vsim-prompt-v1");
		return w;
	}

	private static Draft draft(String name, String intro, Map<VirtualSimCategory, String> bodies) {
		return new Draft(name, "로봇", intro, bodies);
	}

	@Test
	void 키가_없거나_룰셋이_없으면_건너뛴다() {
		VirtualSimWriter off = mock(VirtualSimWriter.class);
		assertThat(job(off, new FakeDisclosureSource(), props(5, 2, 2)).runOnce().status()).isEqualTo("SKIPPED");
		VirtualSimWriter w = gemini();
		assertThat(job(w, new FakeDisclosureSource(), props(5, 2, 2)).runOnce().status()).isEqualTo("SKIPPED");
		verify(w, never()).write(anyList());
	}

	@Test
	void 검사를_통과한_글만_저장하고_사건_하나가_떨어지면_그_사건만_버린다() {
		realRuleset();
		VirtualSimWriter w = gemini();
		when(w.write(anyList())).thenAnswer(inv -> {
			List<VirtualSimWriter.Request> batch = inv.getArgument(0);
			assertThat(batch).hasSize(3);
			assertThat(batch.getFirst().categories()).containsExactlyInAnyOrderElementsOf(
					VirtualSimSample.ruleset().categories().stream().map(VirtualSimRuleset.CategoryStats::category).toList());
			assertThat(batch.stream().map(VirtualSimWriter.Request::industry).distinct()).hasSize(3);
			Map<VirtualSimCategory, String> good = new EnumMap<>(VirtualSimCategory.class);
			good.put(VirtualSimCategory.SUPPLY_CONTRACT, "누리모빌리티가 유럽 완성차 업체와 배터리 팩 공급 계약을 맺었다고 밝혔어요. 계약에 따라 회사는 유럽 생산 공장에 배터리 팩을 납품하게 돼요. 공급은 정해진 일정에 맞춰 나누어 이뤄질 예정이에요.");
			good.put(VirtualSimCategory.DIVIDEND, "누리모빌리티가 이사회에서 올해 결산 배당을 결정했어요. 배당은 정기 주주총회의 승인을 거쳐 주주에게 지급돼요. 회사는 배당 기준일과 지급 절차를 함께 안내했어요.");
			good.put(VirtualSimCategory.NEW_SHARES, "누리모빌리티가 삼성전자와 함께 유상증자를 결정했어요. 새 주식은 기존 주주에게 먼저 배정하고 남은 주식은 청약을 받아 배정해요.");
			good.put(VirtualSimCategory.EARNINGS, "누리모빌리티 매출이 지난해보다 늘었다고 실적을 발표했어요. 회사는 분기 잠정 실적을 공시하고 사업별 내용을 함께 설명했어요.");
			return List.of(new VirtualSimWriter.Written(batch.get(0).id(), draft("누리모빌리티", "물류 창고용 이동 로봇을 만드는 회사예요.", good)),
					new VirtualSimWriter.Written(batch.get(1).id(), draft("삼성바이오텍", "항체 치료제를 연구하는 회사예요.", good)));
		});
		var run = job(w, new FakeDisclosureSource(), props(3, 1, 5)).runOnce();
		assertThat(run.status()).isEqualTo("SUCCESS");
		assertThat(run.saved()).isEqualTo(1);
		assertThat(run.rejected()).containsEntry("COMPANY_REAL_COMPANY", 1).containsEntry("EVENT_REAL_COMPANY", 1).containsEntry("EVENT_TONE", 1)
			.containsEntry("NO_REPLY", 1);
		var companies = store.companies(false, VirtualSimChecker.VERSION);
		assertThat(companies).singleElement().satisfies(c -> {
			assertThat(c.sample()).isFalse();
			assertThat(c.model()).isEqualTo("gemini-test");
			assertThat(c.bodies()).containsOnlyKeys(VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.DIVIDEND);
		});
		assertThat(usage.used(VirtualSimContentJob.JOB)).isEqualTo(1);
		assertThat(runs.findFirstByJobOrderByIdDesc(VirtualSimContentJob.JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");
	}

	@Test
	void 호출이_실패하면_생성만_멈추고_있던_회사는_그대로다() {
		realRuleset();
		store.saveCompany(VirtualSimSample.companies().getFirst(), "gemini-test", "vsim-prompt-v1", VirtualSimChecker.VERSION, false, clock.instant());
		VirtualSimWriter w = gemini();
		when(w.write(anyList())).thenThrow(new IllegalStateException("Gemini 호출 실패: 429"));
		var run = job(w, new FakeDisclosureSource(), props(5, 2, 5)).runOnce();
		assertThat(run.status()).isEqualTo("FAILED");
		assertThat(run.calls()).isEqualTo(1);
		assertThat(store.companies(false, VirtualSimChecker.VERSION)).hasSize(1);
		assertThat(runs.findFirstByJobOrderByIdDesc(VirtualSimContentJob.JOB).orElseThrow().getStatus()).isEqualTo("FAILED");
	}

	@Test
	void 상장사_이름_목록을_못_받으면_부르지_않는다() {
		realRuleset();
		VirtualSimWriter w = gemini();
		DisclosureSource broken = mock(DisclosureSource.class);
		when(broken.listedNames()).thenThrow(new IllegalStateException("DART 키 없음"));
		var run = job(w, broken, props(5, 2, 5)).runOnce();
		assertThat(run.status()).isEqualTo("FAILED");
		assertThat(run.error()).contains("상장사 이름 목록");
		verify(w, never()).write(anyList());
	}

	@Test
	void 하루_호출_상한은_다시_켜도_넘지_않는다() {
		realRuleset();
		VirtualSimWriter w = gemini();
		when(w.write(anyList())).thenReturn(List.of());
		var first = job(w, new FakeDisclosureSource(), props(5, 5, 2)).runOnce();
		assertThat(first.calls()).isEqualTo(2);
		assertThat(first.capped()).isTrue();
		assertThat(first.status()).isEqualTo("SUCCESS");
		// worker를 다시 켠 것처럼 새 작업으로 돌려도 그날 센 수가 남아 부르지 않는다
		var again = job(w, new FakeDisclosureSource(), props(5, 5, 2)).runOnce();
		assertThat(again.calls()).isZero();
		assertThat(again.status()).isEqualTo("SKIPPED");
		verify(w, times(2)).write(anyList());
	}

	@Test
	void 예시_작성기는_예시_회사_여섯_곳을_한_번만_만든다() {
		var p = props(5, 2, 2);
		var run = job(new FakeVirtualSimWriter(), new FakeDisclosureSource(), p).runOnce();
		assertThat(run.status()).isEqualTo("SUCCESS");
		assertThat(run.saved()).isEqualTo(6);
		assertThat(usage.used(VirtualSimContentJob.JOB)).isZero();
		assertThat(store.companies(true, VirtualSimChecker.VERSION)).hasSize(6).allSatisfy(c -> {
			assertThat(c.sample()).isTrue();
			assertThat(c.bodies()).hasSize(5);
		});
		assertThat(job(new FakeVirtualSimWriter(), new FakeDisclosureSource(), p).runOnce().status()).isEqualTo("SKIPPED");
	}
}
