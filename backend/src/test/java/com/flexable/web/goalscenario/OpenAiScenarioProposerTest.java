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
		assertThat(drafts.get(1).mix()).containsEntry("US_INDEX_ETF", 20);
		assertThat(Proposals.validate(drafts)).isPresent();
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
		assertThat(drafts.get(1).explanation()).isNull();
		assertThat(Proposals.check(drafts, ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_EMPTY #1.explanation");
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
