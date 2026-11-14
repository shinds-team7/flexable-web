package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flexable.web.ai.GoalScenarioAiClient;

/** 유형 해설(#417)과 기한별 조합(#431) 미리 만들기(policies §7-6). */
class GoalTypeRoleJobTest {
	private static final String VERSION = "goal-type-role-test";
	/** 기한 60개월, 금액 없음, 적금 3.20%·CMA 2.50%·세율 15.4%. */
	private static final ProposalText.Facts FACTS = new ProposalText.Facts(0, 60, Set.of("WON적금", "우리은행"),
			List.of(new BigDecimal("3.20"), new BigDecimal("2.50"), new BigDecimal("15.4")));
	private static final String GOOD = """
			{"reason":"적금은 원금과 약정 이자가 정해져 있어 흔들리지 않는 몫이에요.","basis":"적금은 {비중}%로, 금리가 연 3.20%로 정해져 있어요. 이자에는 15.4% 세금이 붙어요.",
			 "outlook":"금리가 내려가는 흐름이면 지금 금리를 묶어 두는 점이 장점이에요. 다만 중도에 해지하면 이자가 줄어들 수 있어요."}
			""";

	private final GoalScenarioService service = mock(GoalScenarioService.class);
	private final GoalScenarioAiClient client = mock(GoalScenarioAiClient.class);
	private final TypeRoleStore store = mock(TypeRoleStore.class);
	private final ScenarioAiQuota quota = mock(ScenarioAiQuota.class);
	private final GoalScenarioAiProperties props = new GoalScenarioAiProperties(3, 10, 300, false);
	private final ScenarioPlanStore plans = mock(ScenarioPlanStore.class);
	private final GoalTypeRoleJob job = new GoalTypeRoleJob(service, client, store, quota, props, plans);
	private final TypeRoleSubject saving = TypeRoleSubject.of(ProductType.SAVINGS,
			new TypeRoleSubject.Input("SAVINGS", "은행 정액적립식 적금(우리은행 WON적금), 만기 12개월", "3.20", null, null, null, List.of(), false));
	private final TypeRoleSubject cma = TypeRoleSubject.of(ProductType.CMA,
			new TypeRoleSubject.Input("CMA", "수시 입출금 CMA, 예시 금리, 이자 15.4% 과세", "2.50", null, null, null, List.of(), null));

	@BeforeEach
	void setup() {
		when(client.enabled()).thenReturn(true);
		when(client.typeRolePromptVersion()).thenReturn(VERSION);
		when(service.typeRoleTargets()).thenReturn(List.of(new GoalScenarioService.TypeRoleTarget(saving, FACTS),
				new GoalScenarioService.TypeRoleTarget(cma, FACTS)));
		when(quota.reserveService()).thenReturn(true);
	}

	@Test
	void 지금_자료에_맞는_해설이_있으면_AI를_부르지_않는다() {
		when(store.touch(eq(VERSION), any(), anyString())).thenReturn(true);
		assertThat(job.runOnce()).isEqualTo(new GoalTypeRoleJob.Result(0, 2, 0, false));
		verify(client, never()).typeRole(anyString(), anyString());
		verify(quota, never()).reserveService();
	}

	@Test
	void 없는_해설만_만들고_전체_횟수로_센다() {
		when(store.touch(VERSION, ProductType.CMA, cma.fingerprint())).thenReturn(true);
		when(client.typeRole("SAVINGS", saving.json())).thenReturn(new GoalScenarioAiClient.Result(GOOD, "gpt-test", 100, 200));
		assertThat(job.runOnce()).isEqualTo(new GoalTypeRoleJob.Result(1, 1, 0, false));
		verify(store).save(eq(VERSION), eq(ProductType.SAVINGS), eq(saving.fingerprint()), any(), eq("gpt-test"));
		verify(store).deleteUnseen();
	}

	@Test
	void 전체_상한에_닿으면_멈춘다() {
		when(quota.reserveService()).thenReturn(false);
		assertThat(job.runOnce()).isEqualTo(new GoalTypeRoleJob.Result(0, 0, 0, true));
		verify(client, never()).typeRole(anyString(), anyString());
	}

	@Test
	void 상한에_닿은_뒤에도_남은_대상의_기존_해설은_확인_시각을_갱신한다() {
		// 앞 대상(적금)은 해설이 없어 상한에 걸리고, 뒤 대상(CMA)은 해설이 있다
		when(store.touch(VERSION, ProductType.CMA, cma.fingerprint())).thenReturn(true);
		when(quota.reserveService()).thenReturn(false);
		assertThat(job.runOnce()).isEqualTo(new GoalTypeRoleJob.Result(0, 1, 0, true));
		verify(store).touch(VERSION, ProductType.CMA, cma.fingerprint());
		verify(quota, times(1)).reserveService();
		verify(client, never()).typeRole(anyString(), anyString());
	}

	@Test
	void AI_호출이_실패하면_저장하지_않고_다음_대상으로_간다() {
		when(client.typeRole(anyString(), anyString())).thenThrow(new GoalScenarioAiClient.Failed("TIMEOUT"));
		assertThat(job.runOnce()).isEqualTo(new GoalTypeRoleJob.Result(0, 0, 2, false));
		verify(store, never()).save(any(), any(), any(), any(), any());
	}

	@Test
	void 검사에_걸린_문장만_지우고_비중_자리는_남긴다() {
		String content = """
				{"reason":"적금은 목표 금액을 보장하는 역할이에요. 적금은 흔들리지 않는 몫이에요.",
				 "basis":"적금은 {비중}%로, 금리가 연 3.20%로 정해져 있어요. 연 7% 수익이 나요.","outlook":"연 5% 이자가 기대돼요."}
				""";
		TypeRoleStore.Role role = job.checked(ProductType.SAVINGS, content, FACTS);
		assertThat(role.reason()).isEqualTo("적금은 흔들리지 않는 몫이에요.");
		assertThat(role.basis()).isEqualTo("적금은 {비중}%로, 금리가 연 3.20%로 정해져 있어요.");
		// 전망이 다 지워지면 빈 칸으로 둔다
		assertThat(role.outlook()).isEmpty();
		assertThat(role.filled(40).get(1)).isEqualTo("적금은 40%로, 금리가 연 3.20%로 정해져 있어요.");
	}

	@Test
	void 비중_자리가_없거나_넣은_이유가_비면_저장하지_않는다() {
		assertThat(job.checked(ProductType.SAVINGS, "{\"reason\":\"적금은 몫이에요.\",\"basis\":\"적금은 40%로 정해져 있어요.\",\"outlook\":\"\"}", FACTS))
			.isNull();
		assertThat(job.checked(ProductType.SAVINGS, "{\"reason\":\"\",\"basis\":\"적금은 {비중}%로 정해져 있어요.\",\"outlook\":\"\"}", FACTS)).isNull();
		assertThat(job.checked(ProductType.SAVINGS, "not json", FACTS)).isNull();
	}

	private static final String PLAN_VERSION = "goal-scenario-test";
	private static final String PLAN = """
			{"scenarios":[
			 {"id":"s1","title":"안정","summary":"적금 위주","reason":"기한이 짧아요.","comparison":"가장 덜 흔들려요.","fit":"안정을 원할 때 맞아요.",
			  "mix":{"SAVINGS":70,"CMA":30,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
			 {"id":"s2","title":"균형","summary":"반씩","reason":"나눠 담아요.","comparison":"중간이에요.","fit":"조금 흔들려도 될 때 맞아요.",
			  "mix":{"SAVINGS":50,"CMA":0,"KR_INDEX_ETF":0,"US_INDEX_ETF":50,"KOSPI_TOP5":0}},
			 {"id":"s3","title":"적극","summary":"지수 위주","reason":"기한이 길어요.","comparison":"가장 크게 흔들려요.","fit":"기다릴 수 있을 때 맞아요.",
			  "mix":{"SAVINGS":0,"CMA":20,"KR_INDEX_ETF":40,"US_INDEX_ETF":40,"KOSPI_TOP5":0}}]}
			""";
	private static final ProposalText.Facts FACTS_12 = new ProposalText.Facts(0, 12, Set.of(), List.of(new BigDecimal("3.20"), new BigDecimal("2.50"),
			new BigDecimal("15.4")));
	private final GoalScenarioService.PlanSubject subject = new GoalScenarioService.PlanSubject(new ScenarioProposer.PlanInput(12, List.of()), "fp-12");

	private void planSetup() {
		when(client.planPromptVersion()).thenReturn(PLAN_VERSION);
		when(service.planTargets()).thenReturn(List.of(new GoalScenarioService.PlanTarget(12, subject, FACTS_12, List.of(saving, cma))));
	}

	private void rolesReady() {
		TypeRoleStore.Role role = new TypeRoleStore.Role("이 유형은 몫이에요.", "{비중}%를 담아요.", "");
		when(store.find(eq(VERSION), any(), anyString())).thenReturn(java.util.Optional.of(role));
	}

	@Test
	void 지금_자료에_맞는_조합이_있으면_AI를_부르지_않는다() {
		planSetup();
		when(plans.touch(PLAN_VERSION, 12, "fp-12")).thenReturn(true);
		assertThat(job.runPlans()).isEqualTo(new GoalTypeRoleJob.Result(0, 1, 0, false));
		verify(client, never()).plan(anyString());
	}

	@Test
	void 유형_해설이_아직_없으면_조합을_미룬다() {
		planSetup();
		when(store.find(eq(VERSION), any(), anyString())).thenReturn(java.util.Optional.empty());
		assertThat(job.runPlans()).isEqualTo(new GoalTypeRoleJob.Result(0, 0, 1, false));
		verify(client, never()).plan(anyString());
	}

	@Test
	void 기한마다_조합을_한_번_받아_검사하고_저장한다() {
		planSetup();
		rolesReady();
		when(client.plan(anyString())).thenReturn(new GoalScenarioAiClient.Result(PLAN, "gpt-test", 100, 200));
		assertThat(job.runPlans()).isEqualTo(new GoalTypeRoleJob.Result(1, 0, 0, false));
		// 기한과 통계만 보낸다(금액·회원 정보 없음)
		verify(client).plan("{\"months\":12,\"stats\":[]}");
		verify(quota).reserveService();
		verify(plans).save(eq(PLAN_VERSION), eq(12), eq("fp-12"), any(), eq("gpt-test"));
		verify(plans).deleteUnseen();
	}

	@Test
	void 단계_범위를_어긴_조합은_저장하지_않는다() {
		planSetup();
		rolesReady();
		// 균형 조합의 투자 몫을 20%로 바꾼다
		String off = PLAN.replace("\"SAVINGS\":50,\"CMA\":0,\"KR_INDEX_ETF\":0,\"US_INDEX_ETF\":50", "\"SAVINGS\":80,\"CMA\":0,\"KR_INDEX_ETF\":0,\"US_INDEX_ETF\":20");
		assertThat(off).isNotEqualTo(PLAN);
		when(client.plan(anyString())).thenReturn(new GoalScenarioAiClient.Result(off, "gpt-test", 100, 200));
		assertThat(job.runPlans()).isEqualTo(new GoalTypeRoleJob.Result(0, 0, 1, false));
		verify(plans, never()).save(any(), org.mockito.ArgumentMatchers.anyInt(), any(), any(), any());
	}
}
