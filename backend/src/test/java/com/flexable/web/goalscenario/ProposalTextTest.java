package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.params.ParameterizedTest;
import org.junit.jupiter.params.provider.ValueSource;

/** 제안 문구의 숫자·보장 표현 검사(policies §7-6). 서버가 확인할 수 있는 숫자만 허용한다. */
class ProposalTextTest {
	/** 목표 1,500만 원·1년, 적금 3.50%, CMA 2.50%, 세율 15.4%. 비중은 적금 50·CMA 10·국내 15·미국 25. */
	static final ProposalText.Facts FACTS = new ProposalText.Facts(15_000_000L, 12, Set.of("KODEX 200", "TIGER 미국S&P500", "우리은행", "WON적금"),
			List.of(new BigDecimal("3.50"), new BigDecimal("2.50"), new BigDecimal("15.4")));
	static final List<Integer> MIX = List.of(50, 10, 15, 25);

	@ParameterizedTest
	@ValueSource(strings = {
			"미국 S&P 500 지수와 코스피 200에 나눠 담아요.",
			"TIGER 미국S&P500과 KODEX 200으로 시장 전체에 나눠요.",
			"1년 안에 1,500만 원을 모으는 목표예요.",
			"목표 1500만원을 위해 적금을 바닥에 둬요.",
			"15,000,000원 목표에 맞춰 나눴어요.",
			"적금 금리 연 3.5%와 CMA 예시 금리 2.5%는 정해져 있어요.",
			"미국 ETF 이익에는 15.4% 세금이 붙어요.",
			"적금 50%, CMA 10%, 미국 지수 25%로 나눴어요.",
			"마지막 3개월에는 투자 몫을 적금으로 옮겨요.",
			"코스피 상위 5종목에 같은 금액을 넣어요.",
			"숫자 없이도 충분히 설명할 수 있어요." })
	void 서버가_확인할_수_있는_숫자는_통과(String text) {
		assertThat(ProposalText.problem(text, FACTS, MIX)).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"연 7% 정도 수익이 기대돼요.",
			"매달 50만 원이면 충분해요.",
			"1억 원까지 불어날 수 있어요.",
			"원금의 2배가 될 수 있어요.",
			"10번 중 8번은 목표에 닿아요.",
			"적금 70%로 나눴어요.",
			"2년 뒤에도 기다릴 수 있어요.",
			"KOSPI_TOP5 비중을 늘렸어요.",
			"코스피 상위 10종목에 나눠요.",
			"1,000만~1,500만 원 사이로 모여요." })
	void 서버가_확인할_수_없는_숫자는_막힘(String text) {
		assertThat(ProposalText.problem(text, FACTS, MIX)).isEqualTo("TEXT_NUMBER");
	}

	@ParameterizedTest
	@ValueSource(strings = { "수익이 보장되지 않아요.", "원금을 보장하지 않는 상품이에요.", "결과는 보장할 수 없어요.", "원금 보장이 없어요.",
			"불확실성이 커요.", "오를지는 확실하지 않아요." })
	void 보장_부정문은_통과(String text) {
		assertThat(ProposalText.problem(text, FACTS, MIX)).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = { "원금 보장 상품이에요.", "수익이 보장돼요.", "확실히 오를 거예요.", "무조건 모여요.", "목표 달성을 보장해요." })
	void 보장_단정은_막힘(String text) {
		assertThat(ProposalText.problem(text, FACTS, MIX)).isEqualTo("TEXT_ASSERTION");
	}

	@Test
	void 사실이_없으면_숫자는_모두_막힘() {
		assertThat(ProposalText.problem("1,500만 원을 모아요.", ProposalText.Facts.NONE, List.of())).isEqualTo("TEXT_NUMBER");
		assertThat(ProposalText.problem("적금 50%예요.", ProposalText.Facts.NONE, List.of())).isEqualTo("TEXT_NUMBER");
	}
}
