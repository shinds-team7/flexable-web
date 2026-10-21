package com.flexable.web.savings;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class SavingsCalculatorTest {

	@Test
	void simpleInterestFloorsEachInstallment() {
		// 03 §6 C-12 손계산 예: 월 78,000원 × 12개월, 연 3.5% 단리 → 세전 17,742 · 세금 2,732 · 세후 15,010
		var r = SavingsCalculator.calculate(78_000, null, 12, new BigDecimal("3.5"), false);
		assertThat(r.principal()).isEqualTo(936_000);
		assertThat(r.interestPreTax()).isEqualTo(17_742);
		assertThat(r.tax()).isEqualTo(2_732);
		assertThat(r.interestAfterTax()).isEqualTo(15_010);
		assertThat(r.maturityAmount()).isEqualTo(951_010);
		assertThat(r.excludedAmount()).isZero();
	}

	@Test
	void monthlyLimitExcludesTheRest() {
		var r = SavingsCalculator.calculate(100_000, 30_000L, 6, new BigDecimal("1.2"), false);
		assertThat(r.principal()).isEqualTo(180_000);
		assertThat(r.excludedAmount()).isEqualTo(420_000);
	}

	@Test
	void compoundIsAtLeastSimple() {
		var simple = SavingsCalculator.calculate(78_000, null, 36, new BigDecimal("2.9"), false);
		var compound = SavingsCalculator.calculate(78_000, null, 36, new BigDecimal("2.9"), true);
		assertThat(compound.interestPreTax()).isGreaterThan(simple.interestPreTax());
	}

	@Test
	void zeroRateGivesNoInterest() {
		var r = SavingsCalculator.calculate(78_000, null, 12, BigDecimal.ZERO, true);
		assertThat(r.interestPreTax()).isZero();
		assertThat(r.maturityAmount()).isEqualTo(936_000);
	}
}
