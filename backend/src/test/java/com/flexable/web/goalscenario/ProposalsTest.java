package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** 제안 검사 결과의 로그 한 줄(policies §7-6). 걸린 칸의 문구는 옵션을 켰을 때만, 최대 300자까지 남긴다. */
class ProposalsTest {
	private static final String PROBLEM = "TEXT_NUMBER #1.explanation";

	@Test
	void 옵션을_끄면_문구를_남기지_않는다() {
		assertThat(Proposals.Checked.fail(PROBLEM, "연 7% 수익").logLine(false)).isEqualTo(PROBLEM);
	}

	@Test
	void 문구는_300자까지만_남긴다() {
		String exact = "가".repeat(300);
		assertThat(Proposals.Checked.fail(PROBLEM, exact).logLine(true)).isEqualTo(PROBLEM + " \"" + exact + "\"");
		assertThat(Proposals.Checked.fail(PROBLEM, exact + "나").logLine(true)).isEqualTo(PROBLEM + " \"" + exact + "\"");
	}

	@Test
	void 제어_문자는_공백으로_바꿔_로그_한_줄을_지킨다() {
		assertThat(Proposals.Checked.fail(PROBLEM, "첫 줄\n둘째 줄").logLine(true)).isEqualTo(PROBLEM + " \"첫 줄 둘째 줄\"");
	}
}
