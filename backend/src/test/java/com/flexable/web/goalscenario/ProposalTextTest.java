package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;
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

	/** FACTS에 통계를 더한 것. 월 평균 1.23%, 월 변동폭 4.56%, 최대 하락 23.45%(절댓값). */
	static final ProposalText.Facts STAT_FACTS = new ProposalText.Facts(FACTS.targetAmount(), FACTS.months(), FACTS.names(), FACTS.percents(),
			Map.of(ProposalText.StatKind.MEAN, List.of(new BigDecimal("1.23")), ProposalText.StatKind.VOLATILITY, List.of(new BigDecimal("4.56")),
					ProposalText.StatKind.DRAWDOWN, List.of(new BigDecimal("23.45"))));

	@ParameterizedTest
	@ValueSource(strings = {
			"지난 60개월 최대 하락 23.45%를 고려했어요.",
			"최근 5년 자료에서 월 변동폭은 4.56%예요.",
			"월 평균 수익률은 1.23%였어요.",
			"최대 하락은 약 23.5%예요.",
			"월 변동폭 4.56%, 최대 하락 23.45%예요.",
			"23.45% 하락한 적이 있어요.",
			"지난 60개월 최대 하락은 23.45%였어요. 기대 수익은 화면에서 확인해요.",
			"적금 금리 연 3.5%를 기대할 수 있어요.",
			"과거 60 개월 자료예요." })
	void 보낸_통계와_자료_기간은_통과(String text) {
		assertThat(ProposalText.problem(text, STAT_FACTS, MIX)).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"최대 하락은 30%였어요.",
			"연 23% 수익을 노려요.",
			"최대 하락은 23.451%였어요.",
			"최대 하락은 23.4%였어요.",
			"연 평균 14.76%가 기대돼요.",
			"60개월 뒤에는 달라져요.",
			"5년 뒤에도 기다릴 수 있어요.",
			"지난 36개월 자료예요.",
			"지난 10년 자료예요." })
	void 보내지_않은_통계와_앞으로의_기간은_막힘(String text) {
		assertThat(ProposalText.problem(text, STAT_FACTS, MIX)).isEqualTo("TEXT_NUMBER");
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"기대 수익 4.56%를 노려요.",
			"월 평균 1.23%를 기대해요.",
			"최대 하락 23.45%라는 전망이에요.",
			"목표 수익은 월 평균 1.23%예요.",
			"최대 하락 4.56%였어요.",
			"최대 하락 4.56%, 변동폭 23.45%예요.",
			"수익률 4.56%가 나왔어요.",
			"비슷한 수준이에요. 4.56%였어요. 변동이 있었어요." })
	void 통계를_다른_뜻으로_쓰면_막힘(String text) {
		assertThat(ProposalText.problem(text, STAT_FACTS, MIX)).isEqualTo("TEXT_NUMBER");
	}

	/** MIX의 합: 15+25=40, 50+10=60 등. 45는 어떤 조합으로도 나오지 않는다. */
	@ParameterizedTest
	@ValueSource(strings = {
			"나머지 40%는 국내 대표 지수 ETF와 코스피 대형주에 나누어 투자해 높은 성장 가능성을 노려요.",
			"적금과 CMA를 합쳐 60%예요.",
			"두 상품을 모두 더한 40%를 넣어요." })
	void 합쳤다는_말과_함께_쓴_비중의_합은_통과(String text) {
		assertThat(ProposalText.problem(text, FACTS, MIX)).isNull();
	}

	@ParameterizedTest
	@ValueSource(strings = {
			"수익 40%를 노려요.",
			"나머지 수익 40%예요.",
			"예상 수익은 모두 합쳐 연 40%예요.",
			"기대 수익은 모두 합쳐 40%예요.",
			"모두 합쳐 연 40%예요.",
			"수익이 크지 않은 상품을 합쳐 40%예요.",
			"나머지 40% 수익이 나요.",
			"합쳐 45%예요.",
			"40%를 모두 합쳐요.",
			"나머지 40.5%예요." })
	void 비중의_합이_아니거나_다른_뜻이면_막힘(String text) {
		assertThat(ProposalText.problem(text, FACTS, MIX)).isEqualTo("TEXT_NUMBER");
	}

	@Test
	void 비중_하나뿐인_시나리오는_합이_없다() {
		assertThat(ProposalText.problem("나머지 200%예요.", FACTS, List.of(100))).isEqualTo("TEXT_NUMBER");
	}

	@Test
	void 걸린_문장만_지우고_문단을_유지한다() {
		ProposalText.Cleaned cleaned = ProposalText.clean("첫 문장이에요. 연 7% 수익이에요.\n\n둘째 문단이에요.\n\n수익이 보장돼요.\n\n셋째 문단이에요", FACTS, MIX);
		assertThat(cleaned.text()).isEqualTo("첫 문장이에요.\n\n둘째 문단이에요.\n\n셋째 문단이에요");
		assertThat(cleaned.removed()).containsExactly(new ProposalText.Removed("TEXT_NUMBER", "연 7% 수익이에요."),
				new ProposalText.Removed("TEXT_ASSERTION", "수익이 보장돼요."));
	}

	@Test
	void 소수점과_숫자_쉼표에서는_문장을_나누지_않는다() {
		String text = "적금 금리 3.5%예요. 1,500만 원을 모아요.";
		assertThat(ProposalText.clean(text, FACTS, MIX)).isEqualTo(new ProposalText.Cleaned(text, List.of()));
	}

	@Test
	void 모든_문장이_걸리면_빈_문자열이다() {
		assertThat(ProposalText.clean("연 7%예요. 무조건 올라요.", FACTS, MIX).text()).isEmpty();
	}

	@Test
	void 통계가_없으면_자료_기간도_막힘() {
		assertThat(ProposalText.problem("지난 60개월 자료예요.", FACTS, MIX)).isEqualTo("TEXT_NUMBER");
	}

	@Test
	void 사실이_없으면_숫자는_모두_막힘() {
		assertThat(ProposalText.problem("1,500만 원을 모아요.", ProposalText.Facts.NONE, List.of())).isEqualTo("TEXT_NUMBER");
		assertThat(ProposalText.problem("적금 50%예요.", ProposalText.Facts.NONE, List.of())).isEqualTo("TEXT_NUMBER");
	}

	/** AI에게 보낸 월 납입 가능액과 같은 금액은 쓸 수 있다(#399). 보내지 않았거나 다른 금액이면 막는다. */
	@Test
	void 보낸_월_납입_가능액과_같은_금액만_통과() {
		ProposalText.Facts budget = new ProposalText.Facts(FACTS.targetAmount(), 500_000L, FACTS.months(), FACTS.names(), FACTS.percents(), Map.of());
		assertThat(ProposalText.problem("매달 50만 원이면 충분해요.", FACTS, MIX)).isEqualTo("TEXT_NUMBER");
		assertThat(ProposalText.problem("매달 50만 원으로 해 볼 수 있어요.", budget, MIX)).isNull();
		assertThat(ProposalText.problem("월 500,000원을 참고해 비중을 정했어요.", budget, MIX)).isNull();
		assertThat(ProposalText.problem("1,500만 원 목표예요.", budget, MIX)).isNull();
		assertThat(ProposalText.problem("매달 60만 원이 필요해요.", budget, MIX)).isEqualTo("TEXT_NUMBER");
	}

	/** 가능액으로 충분하다·안에 든다는 단정은 막는다. 필요 월 금액은 서버가 나중에 계산한다(#400 리뷰). */
	@Test
	void 가능액_충족을_단정하면_막힘() {
		ProposalText.Facts budget = new ProposalText.Facts(FACTS.targetAmount(), 500_000L, FACTS.months(), FACTS.names(), FACTS.percents(), Map.of());
		for (String text : List.of("매달 50만 원이면 충분해요.", "월 500,000원 안에서 나눴어요.", "월 납입 가능액 안에 들어요.", "가능액으로도 넉넉해요.",
				"가능액을 넘지 않아요.", "가능액에 맞출 수 있어요.", "50만 원으로 감당할 수 있어요.")) {
			assertThat(ProposalText.problem(text, budget, MIX)).as(text).isEqualTo("TEXT_BUDGET");
		}
		// 가능액을 가리키지 않는 문장의 같은 낱말은 막지 않는다
		assertThat(ProposalText.problem("기한 안에서 꺼내 쓸 여유를 남겨요.", budget, MIX)).isNull();
		assertThat(ProposalText.problem("가능액을 참고해 적금 비중을 높였어요.", budget, MIX)).isNull();
	}
}
