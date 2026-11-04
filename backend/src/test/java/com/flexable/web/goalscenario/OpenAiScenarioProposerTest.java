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
				 {"id":"s1","title":"차근차근","summary":"금리 확정 위주","explanation":"적금과 CMA로 바닥을 받쳐요","mix":{"SAVINGS":70,"CMA":30,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
				 {"id":"s2","title":"나눠서","summary":"지수 ETF를 섞어요","explanation":"국내와 미국 지수에 나눠요","mix":{"SAVINGS":40,"CMA":10,"KR_INDEX_ETF":20,"US_INDEX_ETF":20,"KOSPI_TOP5":10}}]}
				""";
		List<Proposals.Draft> drafts = OpenAiScenarioProposer.parse(content);
		assertThat(drafts).hasSize(2);
		assertThat(drafts.get(1).mix()).containsEntry("US_INDEX_ETF", 20);
		assertThat(Proposals.validate(drafts)).isPresent();
	}

	@Test
	void 비중이_정수가_아니면_검사에서_걸린다() {
		String content = """
				{"scenarios":[
				 {"id":"s1","title":"가","summary":"나","explanation":"다","mix":{"SAVINGS":"백","CMA":0,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}},
				 {"id":"s2","title":"가","summary":"나","explanation":"다","mix":{"SAVINGS":100,"CMA":0,"KR_INDEX_ETF":0,"US_INDEX_ETF":0,"KOSPI_TOP5":0}}]}
				""";
		assertThat(Proposals.validate(OpenAiScenarioProposer.parse(content))).isEmpty();
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
