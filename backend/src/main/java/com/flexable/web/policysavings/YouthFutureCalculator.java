package com.flexable.web.policysavings;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.time.temporal.ChronoUnit;

/**
 * 청년미래적금 만기 계산(policies §9). DB·시계를 모르는 순수 함수다. 원 단위 정수, 건별 내림.
 * 본인 이자는 납입건별 floor(납입금 × (기본 + 우대) ÷ 100 × 예치일수 ÷ 365), 기여금 이자는 기본금리만 적용한다.
 * 일수 기준(÷365)과 기여금 입금일(납입한 달 말일)은 원문에 없는 가정이다.
 */
final class YouthFutureCalculator {

	static final int TERM_MONTHS = 36;
	static final long MAX_MONTHLY = 500_000;
	static final BigDecimal MAX_RATE = BigDecimal.valueOf(20);

	private static final BigDecimal DAYS = BigDecimal.valueOf(365);
	private static final BigDecimal HUNDRED = BigDecimal.valueOf(100);

	enum Type {
		GENERAL(6), PREFERRED(12);

		final int contributionRate;

		Type(int contributionRate) {
			this.contributionRate = contributionRate;
		}
	}

	/** 입력 오류의 이유(policies §9 입력 오류). */
	enum Reject {
		MONTHLY_OVER_LIMIT("monthly", "월 납입은 50만 원까지예요"),
		MONTHLY_INVALID("monthly", "월 납입을 1원 이상으로 넣어 주세요"),
		TERM_UNSUPPORTED("termMonths", "청년미래적금은 36개월만 계산해요"),
		RATE_INVALID("baseRate", "금리는 0% 이상 20% 이하로 넣어 주세요");

		final String field;
		final String message;

		Reject(String field, String message) {
			this.field = field;
			this.message = message;
		}
	}

	record Result(LocalDate maturityDate, long principal, long govContribution, long ownInterest,
			long contributionInterest, long interestPreTax, long tax, long total) {
	}

	private YouthFutureCalculator() {
	}

	/** 입력이 맞으면 null, 아니면 이유. */
	static Reject check(long monthly, int termMonths, BigDecimal baseRate, BigDecimal bonusRate) {
		if (monthly <= 0) {
			return Reject.MONTHLY_INVALID;
		}
		if (monthly > MAX_MONTHLY) {
			return Reject.MONTHLY_OVER_LIMIT;
		}
		if (termMonths != TERM_MONTHS) {
			return Reject.TERM_UNSUPPORTED;
		}
		if (outOfRange(baseRate) || outOfRange(bonusRate)) {
			return Reject.RATE_INVALID;
		}
		return null;
	}

	private static boolean outOfRange(BigDecimal rate) {
		return rate.signum() < 0 || rate.compareTo(MAX_RATE) > 0;
	}

	/** 입력은 {@link #check}를 통과한 값이어야 한다. */
	static Result calculate(LocalDate joinDate, long monthly, Type type, BigDecimal baseRate, BigDecimal bonusRate,
			boolean contributionEarnsInterest) {
		LocalDate maturity = joinDate.plusMonths(TERM_MONTHS);
		BigDecimal ownRate = baseRate.add(bonusRate);
		long contributionPerMonth = monthly * type.contributionRate / 100;
		long own = 0;
		long onContribution = 0;
		for (int i = 0; i < TERM_MONTHS; i++) {
			LocalDate paid = joinDate.plusMonths(i);
			own += interest(monthly, ownRate, ChronoUnit.DAYS.between(paid, maturity));
			if (contributionEarnsInterest) {
				LocalDate deposited = YearMonth.from(paid).atEndOfMonth();
				onContribution += interest(contributionPerMonth, baseRate,
						Math.max(0, ChronoUnit.DAYS.between(deposited, maturity)));
			}
		}
		long principal = monthly * TERM_MONTHS;
		long gov = contributionPerMonth * TERM_MONTHS;
		long pre = own + onContribution;
		return new Result(maturity, principal, gov, own, onContribution, pre, 0, principal + gov + pre);
	}

	private static long interest(long amount, BigDecimal ratePercent, long days) {
		return BigDecimal.valueOf(amount).multiply(ratePercent).multiply(BigDecimal.valueOf(days))
				.divide(HUNDRED.multiply(DAYS), 0, RoundingMode.FLOOR).longValueExact();
	}
}
