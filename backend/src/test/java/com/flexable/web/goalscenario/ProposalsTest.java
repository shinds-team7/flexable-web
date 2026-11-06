package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

/** 제안 검사의 글자 수와 로그 한 줄(policies §7-6). 걸린 칸의 문구는 옵션을 켰을 때만, 최대 2000자까지 남긴다. */
class ProposalsTest {
	private static final String PROBLEM = "TEXT_NUMBER #1.explanation";

	private static List<Proposals.Draft> drafts(String title, String summary, String explanation) {
		return List.of(new Proposals.Draft("s1", title, summary, explanation, Map.of("SAVINGS", 100)),
				new Proposals.Draft("s2", "조합", "설명", "해설이에요", Map.of("CMA", 100)),
				new Proposals.Draft("s3", "조합", "설명", "해설이에요", Map.of("KR_INDEX_ETF", 100)));
	}

	@Test
	void 시나리오는_정확히_세_개여야_한다() {
		List<Proposals.Draft> three = drafts("조합", "설명", "해설");
		assertThat(Proposals.check(three, ProposalText.Facts.NONE).problem()).isNull();
		assertThat(Proposals.check(three.subList(0, 2), ProposalText.Facts.NONE).problem()).isEqualTo("COUNT");
		List<Proposals.Draft> four = new java.util.ArrayList<>(three);
		four.add(new Proposals.Draft("s4", "조합", "설명", "해설", Map.of("US_INDEX_ETF", 100)));
		assertThat(Proposals.check(four, ProposalText.Facts.NONE).problem()).isEqualTo("COUNT");
	}

	@Test
	void 해설은_길이_제한이_없고_문단_줄바꿈을_유지한다() {
		String longText = "가".repeat(1500) + "\n\n" + "나".repeat(1500);
		Proposals.Checked checked = Proposals.check(drafts("조합", "설명", longText), ProposalText.Facts.NONE);
		assertThat(checked.problem()).isNull();
		assertThat(checked.plans().getFirst().explanation()).isEqualTo(longText);
	}

	@Test
	void 해설의_걸린_문장만_지우고_위치를_기록한다() {
		Proposals.Checked checked = Proposals.check(drafts("조합", "설명", "남는 문장이에요. 연 7% 수익이에요."), ProposalText.Facts.NONE);
		assertThat(checked.problem()).isNull();
		assertThat(checked.plans().getFirst().explanation()).isEqualTo("남는 문장이에요.");
		assertThat(checked.removed()).containsExactly(new Proposals.Note("TEXT_NUMBER #1.explanation", "연 7% 수익이에요."));
		assertThat(checked.removed().getFirst().logLine(false)).isEqualTo("TEXT_NUMBER #1.explanation");
		assertThat(checked.removed().getFirst().logLine(true)).isEqualTo("TEXT_NUMBER #1.explanation \"연 7% 수익이에요.\"");
	}

	@Test
	void 해설이_다_지워지면_제안_전체를_버린다() {
		Proposals.Checked checked = Proposals.check(drafts("조합", "설명", "연 7%예요. 무조건 올라요."), ProposalText.Facts.NONE);
		assertThat(checked.plans()).isNull();
		assertThat(checked.problem()).isEqualTo("TEXT_NUMBER #1.explanation");
	}

	@Test
	void 제목과_요약의_규칙_위반은_제안_전체를_버린다() {
		assertThat(Proposals.check(drafts("연 7% 수익", "설명", "해설"), ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_NUMBER #1.title");
		assertThat(Proposals.check(drafts("조합", "무조건 올라요", "해설"), ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_ASSERTION #1.summary");
	}

	@Test
	void 빈_해설은_여전히_걸린다() {
		assertThat(Proposals.check(drafts("조합", "설명", "  "), ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_EMPTY #1.explanation");
	}

	@Test
	void 제목은_20자_요약은_40자까지다() {
		assertThat(Proposals.check(drafts("가".repeat(20), "나".repeat(40), "해설"), ProposalText.Facts.NONE).problem()).isNull();
		assertThat(Proposals.check(drafts("가".repeat(21), "설명", "해설"), ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_LENGTH #1.title");
		assertThat(Proposals.check(drafts("조합", "나".repeat(41), "해설"), ProposalText.Facts.NONE).problem()).isEqualTo("TEXT_LENGTH #1.summary");
	}

	@Test
	void 옵션을_끄면_문구를_남기지_않는다() {
		assertThat(Proposals.Checked.fail(PROBLEM, "연 7% 수익").logLine(false)).isEqualTo(PROBLEM);
	}

	@Test
	void 문구는_2000자까지만_남긴다() {
		String exact = "가".repeat(2000);
		assertThat(Proposals.Checked.fail(PROBLEM, exact).logLine(true)).isEqualTo(PROBLEM + " \"" + exact + "\"");
		assertThat(Proposals.Checked.fail(PROBLEM, exact + "나").logLine(true)).isEqualTo(PROBLEM + " \"" + exact + "\"");
	}

	@Test
	void 제어_문자는_공백으로_바꿔_로그_한_줄을_지킨다() {
		assertThat(Proposals.Checked.fail(PROBLEM, "첫 줄\n둘째 줄").logLine(true)).isEqualTo(PROBLEM + " \"첫 줄 둘째 줄\"");
	}
}
