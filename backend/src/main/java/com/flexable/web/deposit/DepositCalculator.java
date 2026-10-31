package com.flexable.web.deposit;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * 정기예금 만기 계산(적금 03 §6 C-12와 같은 규칙). DB·시계를 모르는 순수 함수다. 원 단위 정수, 나눗셈은 내림.
 * 단리: 원금 × 연이율 × 개월 / 12. 월복리: 원금 × ((1 + 연이율/12)^개월 − 1). 세금 = floor(세전 이자 × 15.4%).
 */
final class DepositCalculator {

	private static final MathContext MC = new MathContext(40, RoundingMode.HALF_EVEN);

	record Result(long principal, long interestPreTax, long tax, long interestAfterTax, long maturityAmount,
			long excludedAmount) {
	}

	private DepositCalculator() {
	}

	/**
	 * @param amount 맡기려는 돈(원)
	 * @param maxLimit 가입 한도(원), 없으면 null. 넘는 돈은 맡기지 못한 것으로 본다
	 * @param months 기간(개월)
	 * @param ratePercent 연 %
	 */
	static Result calculate(long amount, Long maxLimit, int months, BigDecimal ratePercent, boolean compound) {
		long principal = deposit(amount, maxLimit);
		long pre = accrued(principal, months, ratePercent, compound);
		long tax = pre * 154 / 1000;
		long after = pre - tax;
		return new Result(principal, pre, tax, after, principal + after, amount - principal);
	}

	/** 한도를 넘는 돈을 뺀 실제 맡기는 돈. */
	static long deposit(long amount, Long maxLimit) {
		return maxLimit != null && maxLimit > 0 ? Math.min(amount, maxLimit) : amount;
	}

	/** m개월(1~months) 끝까지 쌓인 세전 이자. 마지막 값이 만기 세전 이자다. */
	static long[] accruedByMonth(long amount, Long maxLimit, int months, BigDecimal ratePercent, boolean compound) {
		long principal = deposit(amount, maxLimit);
		long[] out = new long[months];
		for (int m = 1; m <= months; m++) {
			out[m - 1] = accrued(principal, m, ratePercent, compound);
		}
		return out;
	}

	private static long accrued(long principal, int months, BigDecimal ratePercent, boolean compound) {
		BigDecimal p = BigDecimal.valueOf(principal);
		if (compound) {
			BigDecimal factor = BigDecimal.ONE.add(ratePercent.divide(BigDecimal.valueOf(1200), MC));
			return p.multiply(factor.pow(months, MC).subtract(BigDecimal.ONE), MC).setScale(0, RoundingMode.FLOOR).longValueExact();
		}
		return p.multiply(ratePercent)
			.multiply(BigDecimal.valueOf(months))
			.divide(BigDecimal.valueOf(1200), 0, RoundingMode.FLOOR)
			.longValueExact();
	}
}
