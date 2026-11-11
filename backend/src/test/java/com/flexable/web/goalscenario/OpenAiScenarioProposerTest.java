package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.util.List;

import org.junit.jupiter.api.Test;

class OpenAiScenarioProposerTest {

	@Test
	void AI_응답을_초안으로_바꾸고_규칙_검사를_통과한다() {
		String content = """
				{"scenarios":[
				 {"id":"s1","title":"차근차근","summary":"금리 확정 위주","reason":"기한이 짧아요","roles":"적금과 CMA로 바닥을 받쳐요","comparison":"가장 덜 흔들려요","fit":"안정을 원하는 분께 맞아요","mix":{"SAVINGS":70,"CMA":30,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
				 {"id":"s2","title":"나눠서","summary":"지수 ETF를 섞어요","reason":"나눠 담아요","roles":"국내와 미국 지수에 나눠요","comparison":"중간이에요","fit":"기다릴 수 있는 분께 맞아요","mix":{"SAVINGS":40,"CMA":10,"KR_INDEX_ETF":20,"US_INDEX_ETF":20,"KOSPI_TOP5":10}},
				 {"id":"s3","title":"지수만","summary":"지수 ETF 위주","reason":"다","roles":"라","comparison":"마","fit":"바","mix":{"SAVINGS":0,"CMA":0,"KR_INDEX_ETF":100,"US_INDEX_ETF":0,"KOSPI_TOP5":0}}]}
				""";
		List<Proposals.Draft> drafts = OpenAiScenarioProposer.parse(content);
		assertThat(drafts).hasSize(3);
		assertThat(drafts.get(0).explanation()).isEqualTo("기한이 짧아요\n\n적금과 CMA로 바닥을 받쳐요\n\n가장 덜 흔들려요\n\n안정을 원하는 분께 맞아요");
		assertThat(drafts.get(0).parts()).isEqualTo(new Proposals.Parts("기한이 짧아요", "적금과 CMA로 바닥을 받쳐요", "가장 덜 흔들려요", "안정을 원하는 분께 맞아요"));
		assertThat(drafts.get(1).mix()).containsEntry("US_INDEX_ETF", 20);
		assertThat(Proposals.validate(drafts)).isPresent();
		// 검사를 통과한 시나리오도 네 칸을 따로, 합친 문단은 그대로 낸다(policies §7-6, #391)
		Proposals.Plan plan = Proposals.validate(drafts).orElseThrow().getFirst();
		assertThat(plan.parts()).isEqualTo(drafts.get(0).parts());
		assertThat(plan.explanation()).isEqualTo(drafts.get(0).explanation());
	}

	@Test
	void 해설_칸이_하나라도_비면_검사에서_걸린다() {
		String content = """
				{"scenarios":[
				 {"id":"s1","title":"가","summary":"나","reason":"이유예요","roles":" ","comparison":"","fit":"맞는 사람이에요","mix":{"SAVINGS":100}},
				 {"id":"s2","title":"가","summary":"나","reason":" ","roles":"","comparison":" ","fit":"","mix":{"CMA":100}},
				 {"id":"s3","title":"지수만","summary":"지수 ETF 위주","reason":"다","roles":"라","comparison":"마","fit":"바","mix":{"SAVINGS":0,"CMA":0,"KR_INDEX_ETF":100,"US_INDEX_ETF":0,"KOSPI_TOP5":0}}]}
				""";
		List<Proposals.Draft> drafts = OpenAiScenarioProposer.parse(content);
		assertThat(drafts.get(0).explanation()).isNull();
		assertThat(drafts.get(0).parts()).isNull();
		assertThat(drafts.get(1).explanation()).isNull();
		assertThat(Proposals.check(drafts, ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_EMPTY #1.explanation");
	}

	/** v10(#402): 유형별 칸을 비중 있는 유형만 정해진 순서로 한 줄씩 합친다. */
	@Test
	void 유형별_칸을_정해진_순서의_한_줄씩으로_합친다() {
		String content = """
				{"scenarios":[
				 {"id":"s1","title":"나눠서","summary":"지수 ETF를 섞어요","reason":"나눠 담아요","comparison":"중간이에요","fit":"기다릴 수 있는 분께 맞아요",
				  "typeRoles":{
				   "KOSPI_TOP5":{"reason":"코스피 대형주는 집중 몫이에요.","basis":"크게 흔들려요.","outlook":"실적이 좋아지면 오를 수 있어요. 다만 줄어들 수 있어요."},
				   "SAVINGS":{"reason":"적금은 바닥을 받쳐요.","basis":"금리가 정해져 있어요\\n세금이 붙어요","outlook":""},
				   "CMA":{"reason":"","basis":"","outlook":""},
				   "KR_INDEX_ETF":{"reason":"국내 지수 ETF는 성장 몫이에요.","basis":"여러 기업에 나눠요.","outlook":"수요가 커지면 실적 개선이 기대돼요."},
				   "US_INDEX_ETF":{"reason":"비중이 0이라 쓰면 안 돼요.","basis":"","outlook":""}},
				  "mix":{"SAVINGS":40,"CMA":10,"KR_INDEX_ETF":30,"US_INDEX_ETF":0,"KOSPI_TOP5":20}},
				 {"id":"s2","title":"가","summary":"나","reason":"다","comparison":"마","fit":"바",
				  "typeRoles":{"SAVINGS":{"reason":" ","basis":"","outlook":""},"CMA":{"reason":"","basis":"","outlook":""},
				   "KR_INDEX_ETF":{"reason":"","basis":"","outlook":""},"US_INDEX_ETF":{"reason":"","basis":"","outlook":""},"KOSPI_TOP5":{"reason":"","basis":"","outlook":""}},
				  "mix":{"SAVINGS":100,"CMA":0,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
				 {"id":"s3","title":"지수만","summary":"지수 ETF 위주","reason":"다","roles":"라","comparison":"마","fit":"바","mix":{"SAVINGS":0,"CMA":0,"KR_INDEX_ETF":100,"US_INDEX_ETF":0,"KOSPI_TOP5":0}}]}
				""";
		List<Proposals.Draft> drafts = OpenAiScenarioProposer.parse(content);
		// 적금 → (CMA는 칸이 비어 뺌) → 국내 → (미국은 비중 0이라 뺌) → 코스피. 칸 안의 줄바꿈은 띄어쓰기, 마침표 없는 칸 끝에는 마침표
		assertThat(drafts.get(0).parts().roles()).isEqualTo(String.join("\n",
				"적금은 바닥을 받쳐요. 금리가 정해져 있어요 세금이 붙어요.",
				"국내 지수 ETF는 성장 몫이에요. 여러 기업에 나눠요. 수요가 커지면 실적 개선이 기대돼요.",
				"코스피 대형주는 집중 몫이에요. 크게 흔들려요. 실적이 좋아지면 오를 수 있어요. 다만 줄어들 수 있어요."));
		// 비중 있는 유형의 칸이 모두 비면 roles가 비어 검사에서 걸린다(TEXT_EMPTY)
		assertThat(drafts.get(1).parts()).isNull();
		assertThat(Proposals.check(drafts, ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_EMPTY #2.explanation");
		// typeRoles가 없는 응답(옛 형식)은 roles 문자열을 그대로 쓴다
		assertThat(drafts.get(2).parts().roles()).isEqualTo("라");
	}

	@Test
	void 비중이_정수가_아니면_검사에서_걸린다() {
		String content = """
				{"scenarios":[
				 {"id":"s1","title":"가","summary":"나","reason":"다","roles":"라","comparison":"마","fit":"바","mix":{"SAVINGS":"백","CMA":0,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
				 {"id":"s2","title":"가","summary":"나","reason":"다","roles":"라","comparison":"마","fit":"바","mix":{"SAVINGS":100,"CMA":0,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
				 {"id":"s3","title":"지수만","summary":"지수 ETF 위주","reason":"다","roles":"라","comparison":"마","fit":"바","mix":{"SAVINGS":0,"CMA":0,"KR_INDEX_ETF":100,"US_INDEX_ETF":0,"KOSPI_TOP5":0}}]}
				""";
		List<Proposals.Draft> drafts = OpenAiScenarioProposer.parse(content);
		assertThat(drafts.get(0).mix()).containsEntry("SAVINGS", null);
		assertThat(Proposals.check(drafts, ProposalText.Facts.NONE).problem()).isEqualTo("MIX_RANGE #1");
	}

	@Test
	void JSON이_아니면_실패() {
		assertThatThrownBy(() -> OpenAiScenarioProposer.parse("not json")).isInstanceOf(ScenarioProposer.Failed.class);
	}

	@Test
	void 통계_계산() {
		BigDecimal[] r = { new BigDecimal("0.10"), new BigDecimal("-0.20"), new BigDecimal("0.10") };
		assertThat(GoalScenarioService.mean(r)).isCloseTo(0.0, org.assertj.core.data.Offset.offset(1e-12));
		// 1 → 1.1 → 0.88 → 0.968, 최고 1.1 대비 0.88은 20% 하락
		assertThat(GoalScenarioService.maxDrawdown(r)).isCloseTo(0.2, org.assertj.core.data.Offset.offset(1e-12));
		BigDecimal[] avg = GoalScenarioService.averageSeries(List.of(new BigDecimal[] { new BigDecimal("0.1") }, new BigDecimal[] { new BigDecimal("0.3") }));
		assertThat(avg[0]).isEqualByComparingTo("0.2");
	}
}
