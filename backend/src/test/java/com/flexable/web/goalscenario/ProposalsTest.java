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
	void 적금_CMA_비중_합이_큰_조합부터_줄_세우고_같으면_낸_순서를_지킨다() {
		List<Proposals.Draft> mixed = List.of(
				new Proposals.Draft("bold", "공격", "설명", "해설이에요", Map.of("SAVINGS", 10, "CMA", 10, "US_INDEX_ETF", 80)),
				new Proposals.Draft("steady", "안정", "설명", "해설이에요", Map.of("SAVINGS", 70, "CMA", 30)),
				new Proposals.Draft("spread", "균형", "설명", "해설이에요", Map.of("SAVINGS", 40, "CMA", 10, "KR_INDEX_ETF", 50)));
		assertThat(Proposals.check(mixed, ProposalText.Facts.NONE).plans()).extracting(Proposals.Plan::id).containsExactly("steady", "spread", "bold");
		// 합이 같으면(적금 100 · CMA 100) 제안기가 낸 순서
		assertThat(Proposals.check(drafts("조합", "설명", "해설"), ProposalText.Facts.NONE).plans()).extracting(Proposals.Plan::id).containsExactly("s1", "s2", "s3");
		// 데모 조합은 이미 안정 → 균형 → 공격 순서다
		assertThat(Proposals.validate(Proposals.DEMO).orElseThrow()).extracting(Proposals.Plan::id).containsExactly("steady", "spread", "bold");
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

	private static List<Proposals.Draft> partsDrafts(Proposals.Parts first) {
		Proposals.Parts ok = new Proposals.Parts("이유예요.", "역할이에요.", "차이예요.", "맞는 사람이에요.");
		return List.of(new Proposals.Draft("s1", "조합", "설명", first, Map.of("SAVINGS", 100)),
				new Proposals.Draft("s2", "조합", "설명", ok, Map.of("CMA", 100)),
				new Proposals.Draft("s3", "조합", "설명", ok, Map.of("KR_INDEX_ETF", 100)));
	}

	@Test
	void 네_칸은_칸마다_걸린_문장만_지우고_다_지워진_칸은_빈_칸이다() {
		Proposals.Checked checked = Proposals.check(partsDrafts(
				new Proposals.Parts("이유예요. 연 7% 수익이에요.", "무조건 올라요.", "차이예요.", "맞는 사람이에요.")), ProposalText.Facts.NONE);
		assertThat(checked.problem()).isNull();
		Proposals.Plan plan = checked.plans().getFirst();
		assertThat(plan.parts()).isEqualTo(new Proposals.Parts("이유예요.", "", "차이예요.", "맞는 사람이에요."));
		assertThat(plan.explanation()).isEqualTo("이유예요.\n\n차이예요.\n\n맞는 사람이에요.");
		// 로그 위치는 칸을 나누지 않는다
		assertThat(checked.removed()).containsExactly(new Proposals.Note("TEXT_NUMBER #1.explanation", "연 7% 수익이에요."),
				new Proposals.Note("TEXT_ASSERTION #1.explanation", "무조건 올라요."));
	}

	@Test
	void 네_칸이_모두_지워지면_제안_전체를_버린다() {
		Proposals.Checked checked = Proposals.check(partsDrafts(
				new Proposals.Parts("연 7%예요.", "무조건 올라요.", "매달 50만 원이에요.", "수익이 보장돼요.")), ProposalText.Facts.NONE);
		assertThat(checked.plans()).isNull();
		assertThat(checked.problem()).isEqualTo("TEXT_NUMBER #1.explanation");
		assertThat(checked.logLine(true)).startsWith("TEXT_NUMBER #1.explanation \"연 7%예요.\n\n무조건 올라요.".replace("\n", " "));
	}

	@Test
	void 네_칸_중_빈_칸이_있으면_걸린다() {
		assertThat(Proposals.check(partsDrafts(new Proposals.Parts("이유예요.", " ", "차이예요.", "맞는 사람이에요.")), ProposalText.Facts.NONE).problem())
			.isEqualTo("TEXT_EMPTY #1.explanation");
	}

	@Test
	void 네_칸이_없는_옛_초안은_합친_문단만_검사하고_칸은_null이다() {
		Proposals.Checked checked = Proposals.check(drafts("조합", "설명", "남는 문장이에요.\n\n둘째 문단이에요."), ProposalText.Facts.NONE);
		assertThat(checked.plans().getFirst().parts()).isNull();
		assertThat(checked.plans().getFirst().explanation()).isEqualTo("남는 문장이에요.\n\n둘째 문단이에요.");
	}

	@Test
	void 데모_조합은_네_칸이_모두_있고_규칙을_통과한다() {
		List<Proposals.Plan> demo = Proposals.validate(Proposals.DEMO).orElseThrow();
		assertThat(demo).hasSize(3).allSatisfy(p -> {
			assertThat(p.parts()).isNotNull();
			assertThat(p.parts().all()).allSatisfy(t -> assertThat(t).isNotBlank());
			assertThat(p.explanation()).isEqualTo(p.parts().joined());
		});
		assertThat(Proposals.check(Proposals.DEMO, ProposalText.Facts.NONE).removed()).isEmpty();
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
