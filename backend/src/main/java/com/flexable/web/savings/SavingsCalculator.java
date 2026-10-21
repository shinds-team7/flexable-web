package com.flexable.web.savings;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;

/**
 * 적금 만기 계산(03 §6 C-12). DB·시계를 모르는 순수 함수다. 원 단위 정수, 나눗셈은 내림.
 * 매달 같은 금액을 넣고, 남은 개월 수가 k인 납입분마다 이자를 따로 내림해 합친다.
 * 단리: 납입분 × 연이율 × k / 12. 월복리: 납입분 × ((1 + 연이율/12)^k − 1). 세금 = floor(세전 이자 × 15.4%).
 */
final class SavingsCalculator {

	private static final MathContext MC = new MathContext(40, RoundingMode.HALF_EVEN);

	record Result(long principal, long interestPreTax, long tax, long interestAfterTax, long maturityAmount,
			long excludedAmount) {
	}

	private SavingsCalculator() {
	}

	/**
	 * @param monthly 매달 넣으려는 돈(원)
	 * @param maxLimit 월 한도(원), 없으면 null. 넘는 돈은 넣지 못한 것으로 본다
	 * @param months 기간(개월)
	 * @param ratePercent 연 %
	 */
	static Result calculate(long monthly, Long maxLimit, int months, BigDecimal ratePercent, boolean compound) {
		long deposit = maxLimit != null && maxLimit > 0 ? Math.min(monthly, maxLimit) : monthly;
		long excluded = (monthly - deposit) * months;
		BigDecimal depositAmount = BigDecimal.valueOf(deposit);
		long pre = 0;
		if (compound) {
			BigDecimal factor = BigDecimal.ONE.add(ratePercent.divide(BigDecimal.valueOf(1200), MC));
			BigDecimal power = BigDecimal.ONE;
			for (int k = 1; k <= months; k++) {
				power = power.multiply(factor, MC);
				pre += depositAmount.multiply(power.subtract(BigDecimal.ONE), MC)
					.setScale(0, RoundingMode.FLOOR)
					.longValueExact();
			}
		}
		else {
			BigDecimal perMonth = depositAmount.multiply(ratePercent);
			for (int k = 1; k <= months; k++) {
				pre += perMonth.multiply(BigDecimal.valueOf(k))
					.divide(BigDecimal.valueOf(1200), 0, RoundingMode.FLOOR)
					.longValueExact();
			}
		}
		long tax = pre * 154 / 1000;
		long after = pre - tax;
		long principal = deposit * months;
		return new Result(principal, pre, tax, after, principal + after, excluded);
	}
}
