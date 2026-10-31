package com.flexable.web.deposit;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;

import org.junit.jupiter.api.Test;

class DepositCalculatorTest {

	@Test
	void 단리_1000만원_3_5퍼센트_12개월() {
		DepositCalculator.Result r = DepositCalculator.calculate(10_000_000L, null, 12, new BigDecimal("3.50"), false);
		assertThat(r.principal()).isEqualTo(10_000_000L);
		assertThat(r.interestPreTax()).isEqualTo(350_000L);
		assertThat(r.tax()).isEqualTo(53_900L); // floor(350000 × 0.154)
		assertThat(r.interestAfterTax()).isEqualTo(296_100L);
		assertThat(r.maturityAmount()).isEqualTo(10_296_100L);
		assertThat(r.excludedAmount()).isZero();
	}

	@Test
	void 월복리_1000만원_3_5퍼센트_12개월() {
		DepositCalculator.Result r = DepositCalculator.calculate(10_000_000L, null, 12, new BigDecimal("3.50"), true);
		assertThat(r.interestPreTax()).isEqualTo(355_669L);
		assertThat(r.tax()).isEqualTo(54_773L); // floor(355669 × 0.154)
		assertThat(r.maturityAmount()).isEqualTo(10_000_000L + 355_669L - 54_773L);
	}

	@Test
	void 단리_6개월은_이자를_내림한다() {
		DepositCalculator.Result r = DepositCalculator.calculate(1_234_567L, null, 6, new BigDecimal("3.33"), false);
		// 1234567 × 3.33 × 6 / 1200 = 20555.54 → 20555
		assertThat(r.interestPreTax()).isEqualTo(20_555L);
	}

	@Test
	void 가입_한도를_넘는_돈은_계산에서_빼고_따로_센다() {
		DepositCalculator.Result r = DepositCalculator.calculate(30_000_000L, 20_000_000L, 12, new BigDecimal("3.00"), false);
		assertThat(r.principal()).isEqualTo(20_000_000L);
		assertThat(r.excludedAmount()).isEqualTo(10_000_000L);
		assertThat(r.interestPreTax()).isEqualTo(600_000L);
	}

	@Test
	void 달마다_쌓인_이자의_마지막_값은_만기_이자다() {
		long[] series = DepositCalculator.accruedByMonth(10_000_000L, null, 12, new BigDecimal("3.50"), true);
		assertThat(series).hasSize(12);
		assertThat(series[0]).isEqualTo(29_166L);
		assertThat(series[11]).isEqualTo(355_669L);
		for (int i = 1; i < series.length; i++) {
			assertThat(series[i]).isGreaterThanOrEqualTo(series[i - 1]);
		}
	}
}
