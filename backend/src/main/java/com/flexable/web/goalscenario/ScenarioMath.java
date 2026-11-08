package com.flexable.web.goalscenario;

import java.math.BigDecimal;
import java.math.MathContext;
import java.math.RoundingMode;
import java.util.EnumMap;
import java.util.Map;
import java.util.function.LongFunction;

/**
 * 목표 달성 시나리오의 순수 계산(policies §7-3~7-5). DB·시계를 모른다. 원 단위 정수, 나눗셈은 내림.
 * 투자 몫의 평가액은 넣는 금액에 비례하므로, 경로마다 "매달 1원을 넣으면 기한 말에 얼마인지"(배수)를 한 번 구해 두고 금액을 곱해 내림한다.
 */
final class ScenarioMath {

	static final MathContext MC = new MathContext(34, RoundingMode.HALF_EVEN);
	private static final BigDecimal TWELVE_HUNDRED = BigDecimal.valueOf(1200);

	/** 넣은 돈·세전 이자(또는 평가 이익)·세금·기한 말 세후 금액. */
	record Amounts(long principal, long gain, long tax, long finalAmount) {
	}

	private ScenarioMath() {
	}

	/** 세금 floor(x × 0.154). x가 0 이하면 0. */
	static long tax(long x) {
		return x > 0 ? x * 154 / 1000 : 0;
	}

	/** CMA: 매달 초 넣은 뒤 그 달 이자 floor(잔액 × 연이율 ÷ 12)를 더하고, 기한 말에 총이자의 세금을 뺀다. */
	static Amounts cma(long monthly, int months, BigDecimal ratePercent) {
		return cmaStaged(monthly, months, ratePercent, ratePercent, months);
	}

	/** CMA인데 fromMonth개월 뒤부터는 이율이 laterPercent로 바뀐다(policies §7-9 금리 하락 가정). 그 밖은 cma와 같다. */
	static Amounts cmaStaged(long monthly, int months, BigDecimal ratePercent, BigDecimal laterPercent, int fromMonth) {
		long balance = 0;
		long interest = 0;
		for (int m = 0; m < months; m++) {
			balance += monthly;
			long i = monthInterest(balance, m < fromMonth ? ratePercent : laterPercent);
			balance += i;
			interest += i;
		}
		long tax = tax(interest);
		return new Amounts(monthly * months, interest, tax, balance - tax);
	}

	/** CMA에 목돈을 한 번 넣고 months개월 둔다. 매달 이자 floor(잔액 × 연이율 ÷ 12)가 잔액에 붙고, 기한 말에 총이자의 세금을 뺀다. */
	static Amounts cmaLump(long amount, int months, BigDecimal ratePercent) {
		long balance = amount;
		long interest = 0;
		for (int m = 0; m < months; m++) {
			long i = monthInterest(balance, ratePercent);
			balance += i;
			interest += i;
		}
		long tax = tax(interest);
		return new Amounts(amount, interest, tax, balance - tax);
	}

	private static long monthInterest(long balance, BigDecimal ratePercent) {
		return BigDecimal.valueOf(balance).multiply(ratePercent).divide(TWELVE_HUNDRED, 0, RoundingMode.FLOOR).longValueExact();
	}

	/** 매달 초 1원을 넣고 그 달 수익률을 적용했을 때 기한 말 평가액 = Σ(그 달부터 끝까지 (1 + r)의 곱). */
	static BigDecimal factor(BigDecimal[] returns) {
		BigDecimal v = BigDecimal.ZERO;
		for (BigDecimal r : returns) {
			v = v.add(BigDecimal.ONE).multiply(BigDecimal.ONE.add(r), MC);
		}
		return v;
	}

	/** 투자 몫: 평가액 = floor(월 금액 × 배수). 과세 상품은 이익이 0보다 크면 floor(이익 × 0.154)를 뺀다. */
	static Amounts invest(long monthly, int months, BigDecimal factor, boolean taxed) {
		long value = BigDecimal.valueOf(monthly).multiply(factor, MC).setScale(0, RoundingMode.FLOOR).longValueExact();
		long principal = monthly * months;
		long tax = taxed ? tax(value - principal) : 0;
		return new Amounts(principal, value - principal, tax, value - tax);
	}

	/** 처음 모은 돈 amount를 투자 상품에 한꺼번에 넣었을 때 기한 말: 평가액 floor(amount × 배수), 과세 상품은 이익이 0보다 크면 floor(이익 × 0.154)를 뺀다. */
	static Amounts lumpInvest(long amount, BigDecimal factor, boolean taxed) {
		long value = BigDecimal.valueOf(amount).multiply(factor, MC).setScale(0, RoundingMode.FLOOR).longValueExact();
		long tax = taxed ? tax(value - amount) : 0;
		return new Amounts(amount, value - amount, tax, value - tax);
	}

	/** 처음 한 번 넣은 돈의 배수 = 기한 말까지 (1 + 월 수익률)의 곱. */
	static BigDecimal lumpFactor(BigDecimal[] returns) {
		BigDecimal v = BigDecimal.ONE;
		for (BigDecimal r : returns) {
			v = v.multiply(BigDecimal.ONE.add(r), MC);
		}
		return v;
	}

	/** 유형별 월 금액 = 월 금액 × 비중 ÷ 100(월 금액이 천 원 단위라 나누어떨어진다). */
	static Map<ProductType, Long> allocate(long monthly, Map<ProductType, Integer> mix) {
		Map<ProductType, Long> out = new EnumMap<>(ProductType.class);
		mix.forEach((t, ratio) -> {
			if (ratio > 0) {
				out.put(t, monthly * ratio / 100);
			}
		});
		return out;
	}

	/** 오름차순 정렬한 n개 중 하위 qBp(만분율) 위치 = ⌈q × n⌉ − 1. */
	static int quantileIndex(int n, int qBp) {
		return (int) (((long) qBp * n + 9999) / 10000) - 1;
	}

	/** 기준 비율(만분율)을 채우는 경로 수 = ⌈share × n⌉. */
	static int needed(int n, int shareBp) {
		return (int) (((long) shareBp * n + 9999) / 10000);
	}

	/**
	 * 경로 중 needed개 이상이 목표 이상이 되는 가장 작은 천 원 단위 월 금액(0원, 1,000원~목표 금액). 없으면 -1.
	 * 0원이면 처음 모은 돈만으로 닿는다는 뜻이다. finals(월 금액)는 경로별 기한 말 금액이며 월 금액에 대해 줄어들지 않는다(내림·세금 모두 단조)는 점을 이용해 이분 탐색한다.
	 */
	static long requiredMonthly(long target, int needed, LongFunction<long[]> finals) {
		if (reached(finals.apply(0), target) >= needed) {
			return 0;
		}
		long lo = 1;
		long hi = target / 1000;
		if (hi < 1 || reached(finals.apply(hi * 1000), target) < needed) {
			return -1;
		}
		while (lo < hi) {
			long mid = (lo + hi) >>> 1;
			if (reached(finals.apply(mid * 1000), target) >= needed) {
				hi = mid;
			}
			else {
				lo = mid + 1;
			}
		}
		return lo * 1000;
	}

	static int reached(long[] finals, long target) {
		int c = 0;
		for (long f : finals) {
			if (f >= target) {
				c++;
			}
		}
		return c;
	}

	/** 만분율(내림). */
	static int bp(int count, int n) {
		return (int) ((long) count * 10000 / n);
	}
}
