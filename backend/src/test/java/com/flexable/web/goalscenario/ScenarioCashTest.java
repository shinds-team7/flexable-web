package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.flexable.web.deposit.DepositService;
import com.flexable.web.goalscenario.GoalScenarioDtos.Outcome;
import com.flexable.web.goalscenario.GoalScenarioDtos.Scenario;
import com.flexable.web.goalscenario.Proposals.Plan;
import com.flexable.web.savings.SavingsService;

/** policies §7-9: 적금·예금·CMA 저축 쪽 계산(3년 초과 재예치, 처음 돈, 금리 하락 가정)과 플랜 표시 규칙. */
class ScenarioCashTest {

	private static final BigDecimal SAVING = new BigDecimal("3.80");
	private static final BigDecimal CMA = new BigDecimal("2.50");

	private static ScenarioCash cash(int months, BigDecimal drop) {
		return new ScenarioCash(months, new ScenarioCash.Rate(SAVING, false), new ScenarioCash.Rate(new BigDecimal("3.60"), false),
				new ScenarioCash.Rate(new BigDecimal("3.30"), false), new ScenarioCash.Rate(new BigDecimal("3.40"), false), CMA, drop);
	}

	@Test
	void 삼_년_이하는_적금_만기_그대로() {
		ScenarioCash c = cash(36, BigDecimal.ZERO);
		assertThat(c.savings(500_000)).isEqualTo(SavingsService.maturity(500_000, 36, SAVING, false).finalAmount());
		assertThat(c.cma(500_000)).isEqualTo(ScenarioMath.cma(500_000, 36, CMA).finalAmount());
		assertThat(c.savings(0)).isZero();
		assertThat(c.cma(0)).isZero();
	}

	@Test
	void 사_년은_삼_년_만기금을_예금에_다시_맡기고_남은_기간_새_적금을_넣는다() {
		ScenarioCash c = cash(48, BigDecimal.ZERO);
		long first = SavingsService.maturity(500_000, 36, SAVING, false).finalAmount();
		long rolled = DepositService.maturity(first, 12, new BigDecimal("3.40"), false).finalAmount();
		long next = SavingsService.maturity(500_000, 12, new BigDecimal("3.30"), false).finalAmount();
		assertThat(c.savings(500_000)).isEqualTo(rolled + next);
	}

	@Test
	void 금리가_일_퍼센트포인트_낮아지면_삼_년_뒤_구간만_줄고_음수로_내려가지_않는다() {
		long base = cash(60, BigDecimal.ZERO).savings(500_000);
		long down = cash(60, ScenarioCash.RATE_DROP).savings(500_000);
		assertThat(down).isLessThan(base);
		// 첫 3년은 같다: 3년 이하 기한은 금리 하락 가정이 결과를 바꾸지 않는다
		assertThat(cash(36, ScenarioCash.RATE_DROP).savings(500_000)).isEqualTo(cash(36, BigDecimal.ZERO).savings(500_000));
		assertThat(cash(36, ScenarioCash.RATE_DROP).cma(500_000)).isEqualTo(cash(36, BigDecimal.ZERO).cma(500_000));
		// 낮아진 금리가 0 아래로 가지 않는다: CMA 0.5%에서 1%p 하락 → 0%
		ScenarioCash low = new ScenarioCash(48, new ScenarioCash.Rate(SAVING, false), null, null, null, new BigDecimal("0.50"), ScenarioCash.RATE_DROP);
		assertThat(low.cma(100_000)).isEqualTo(ScenarioMath.cmaStaged(100_000, 48, new BigDecimal("0.50"), BigDecimal.ZERO, 36).finalAmount());
	}

	@Test
	void CMA_월_납입은_삼_년_뒤부터_하락한_금리를_쓴다() {
		long expected = ScenarioMath.cmaStaged(300_000, 60, CMA, new BigDecimal("1.50"), 36).finalAmount();
		assertThat(cash(60, ScenarioCash.RATE_DROP).cma(300_000)).isEqualTo(expected);
		assertThat(cash(60, BigDecimal.ZERO).cma(300_000)).isEqualTo(ScenarioMath.cma(300_000, 60, CMA).finalAmount());
	}

	@Test
	void 묶는_이득이_묶는_일_년당_일만_원_미만이면_CMA() {
		// 경계: 12개월 묶음에서 10,000원 차이는 묶고 9,999원 차이는 CMA
		assertThat(ScenarioCash.worthLocking(1_010_000, 1_000_000, 12)).isTrue();
		assertThat(ScenarioCash.worthLocking(1_009_999, 1_000_000, 12)).isFalse();
		// 24개월은 20,000원, 6개월은 5,000원
		assertThat(ScenarioCash.worthLocking(1_020_000, 1_000_000, 24)).isTrue();
		assertThat(ScenarioCash.worthLocking(1_019_999, 1_000_000, 24)).isFalse();
		assertThat(ScenarioCash.worthLocking(1_005_000, 1_000_000, 6)).isTrue();
		assertThat(ScenarioCash.worthLocking(990_000, 1_000_000, 12)).isFalse();
	}

	@Test
	void 처음_돈은_예금이_나으면_예금_아니면_CMA() {
		ScenarioCash c = cash(12, BigDecimal.ZERO);
		// 예금 3.60%(단리)와 CMA 2.50%(월복리) — 600만 원이면 이득이 1만 원을 훌쩍 넘는다. 예금 후보가 1년용이라 3.60을 그대로 쓴다
		ScenarioCash.Lump big = c.lump(6_000_000);
		assertThat(big.place()).isEqualTo(ScenarioCash.Place.DEPOSIT);
		assertThat(big.finalAmount()).isEqualTo(DepositService.maturity(6_000_000, 12, new BigDecimal("3.60"), false).finalAmount());
		// 적은 돈(10만 원)은 이득이 1만 원 미만이라 CMA
		ScenarioCash.Lump small = c.lump(100_000);
		assertThat(small.place()).isEqualTo(ScenarioCash.Place.CMA);
		assertThat(small.finalAmount()).isEqualTo(ScenarioMath.cmaLump(100_000, 12, CMA).finalAmount());
		// 예금 공시가 없으면 CMA
		ScenarioCash none = new ScenarioCash(12, new ScenarioCash.Rate(SAVING, false), null, null, null, CMA, BigDecimal.ZERO);
		assertThat(none.lump(6_000_000).place()).isEqualTo(ScenarioCash.Place.CMA);
		assertThat(none.lump(0).finalAmount()).isZero();
	}

	@Test
	void 처음_돈의_사_년_계산은_만기금을_재예치한다() {
		ScenarioCash c = cash(48, BigDecimal.ZERO);
		long first = DepositService.maturity(6_000_000, 36, new BigDecimal("3.60"), false).finalAmount();
		long rolled = DepositService.maturity(first, 12, new BigDecimal("3.40"), false).finalAmount();
		ScenarioCash.Lump lump = c.lump(6_000_000);
		assertThat(lump.place()).isEqualTo(ScenarioCash.Place.DEPOSIT);
		assertThat(lump.finalAmount()).isEqualTo(rolled);
	}

	@Test
	void 재예치용_예금과_새_적금이_없으면_CMA에_둔다() {
		ScenarioCash c = new ScenarioCash(48, new ScenarioCash.Rate(SAVING, false), null, null, null, CMA, BigDecimal.ZERO);
		long first = SavingsService.maturity(500_000, 36, SAVING, false).finalAmount();
		long rolled = ScenarioMath.cmaLump(first, 12, CMA).finalAmount();
		long next = ScenarioMath.cmaStaged(500_000, 12, CMA, CMA, 12).finalAmount();
		assertThat(c.savings(500_000)).isEqualTo(rolled + next);
	}

	@Test
	void 처음_돈의_나눔은_투자_몫을_빼고_나머지를_저축_몫으로_한다() {
		Map<ProductType, Integer> mix = new java.util.EnumMap<>(ProductType.class);
		mix.put(ProductType.SAVINGS, 40);
		mix.put(ProductType.CMA, 10);
		mix.put(ProductType.KR_INDEX_ETF, 20);
		mix.put(ProductType.US_INDEX_ETF, 20);
		mix.put(ProductType.KOSPI_TOP5, 10);
		Map<ProductType, Integer> counts = Map.of(ProductType.KR_INDEX_ETF, 1, ProductType.US_INDEX_ETF, 1, ProductType.KOSPI_TOP5, 5);
		GoalScenarioService.Split split = GoalScenarioService.splitInitial(10_000_003, mix, counts);
		assertThat(split.each().get(ProductType.KR_INDEX_ETF)).isEqualTo(2_000_000L);
		assertThat(split.each().get(ProductType.US_INDEX_ETF)).isEqualTo(2_000_000L);
		assertThat(split.each().get(ProductType.KOSPI_TOP5)).isEqualTo(200_000L); // 1,000,000 ÷ 5
		long invested = 2_000_000 + 2_000_000 + 200_000 * 5;
		assertThat(split.saving()).as("금액 보존").isEqualTo(10_000_003 - invested);
		assertThat(GoalScenarioService.splitInitial(0, mix, counts).saving()).isZero();
		// 40원: 국내·미국 지수는 8원씩, 코스피는 4원 ÷ 5종목이 0원이라 투자하지 않고 저축 몫으로 남긴다
		GoalScenarioService.Split tiny = GoalScenarioService.splitInitial(40, mix, counts);
		assertThat(tiny.each()).containsOnlyKeys(ProductType.KR_INDEX_ETF, ProductType.US_INDEX_ETF);
		assertThat(tiny.saving()).isEqualTo(40 - 16);
	}

	private static Scenario scenario(String id, boolean reachable, Long monthly, int lossBp) {
		Outcome outcome = reachable ? new Outcome("RANGE", null, 1L, 2L, 3L, 8000, lossBp) : null;
		return new Scenario(id, id, id, id, List.of(), reachable, monthly, null, outcome, null, false, null, null);
	}

	@Test
	void 추천은_손실_일_할_이하_중_월_금액이_가장_작은_플랜() {
		List<Scenario> list = List.of(scenario("a", true, 900_000L, 0), scenario("b", true, 700_000L, 800), scenario("c", true, 500_000L, 3000));
		assertThat(GoalScenarioService.recommend(list)).isEqualTo("b");
		// 경계: 손실 10.00%는 허용, 10.01%는 제외
		assertThat(GoalScenarioService.recommend(List.of(scenario("a", true, 900_000L, 0), scenario("c", true, 500_000L, 1000)))).isEqualTo("c");
		assertThat(GoalScenarioService.recommend(List.of(scenario("a", true, 900_000L, 0), scenario("c", true, 500_000L, 1001)))).isEqualTo("a");
		// 월 금액이 같으면 앞선 플랜
		assertThat(GoalScenarioService.recommend(List.of(scenario("a", true, 500_000L, 0), scenario("b", true, 500_000L, 0)))).isEqualTo("a");
	}

	@Test
	void 허용_손실을_넘는_플랜뿐이면_손실이_가장_낮은_플랜_닿는_플랜이_없으면_없음() {
		List<Scenario> risky = List.of(scenario("a", true, 400_000L, 4000), scenario("b", true, 600_000L, 2500), scenario("c", false, null, 0));
		assertThat(GoalScenarioService.recommend(risky)).isEqualTo("b");
		assertThat(GoalScenarioService.recommend(List.of(scenario("a", false, null, 0), scenario("b", false, null, 0)))).isNull();
	}

	@Test
	void 처음_돈만으로_닿는_플랜의_월_금액은_영원() {
		assertThat(GoalScenarioService.recommend(List.of(scenario("a", true, 0L, 0), scenario("b", true, 0L, 0)))).isEqualTo("a");
	}

	private static Plan plan(String id, int invest) {
		Map<ProductType, Integer> mix = new java.util.EnumMap<>(ProductType.class);
		mix.put(ProductType.SAVINGS, 100 - invest);
		if (invest > 0) {
			mix.put(ProductType.KR_INDEX_ETF, invest);
		}
		return new Plan(id, id, id, id, mix);
	}

	@Test
	void 스타일은_투자_비중이_낮은_순서로_붙고_제안_순서는_그대로() {
		assertThat(GoalScenarioService.styles(List.of(plan("a", 60), plan("b", 0), plan("c", 30)))).containsExactly("AGGRESSIVE", "SAFE", "BALANCED");
		// 비중이 같으면 제안 순서
		assertThat(GoalScenarioService.styles(List.of(plan("a", 20), plan("b", 20), plan("c", 20)))).containsExactly("SAFE", "BALANCED", "AGGRESSIVE");
	}
}
