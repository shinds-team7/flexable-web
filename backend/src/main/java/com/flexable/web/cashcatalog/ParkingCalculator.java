package com.flexable.web.cashcatalog;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.List;
import java.util.regex.Pattern;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/**
 * 파킹통장 기본금리 이자 계산(policies §11, 규칙 parking-calc-v1). DB·시계를 모르는 순수 함수다.
 * 이자 = floor(잔액 × 연이율(%) × 일수 ÷ 36500), 세금 = floor(이자 × 15.4%). 우대·이벤트·구간 금리는 넣지 않는다.
 * 원문에 금액 구간이 있어 기본금리 하나로 계산하면 틀릴 수 있는 상품은 계산하지 않는다({@link #reason}).
 */
final class ParkingCalculator {

	static final String RULES_VERSION = "parking-calc-v1";
	static final long MAX_AMOUNT = 10_000_000_000L;
	static final int MAX_DAYS = 3650;

	private static final String BOILERPLATE = "구간별·우대조건을 확인해야 하며 최고금리를 전체 잔액에 적용하지 않아요.";
	private static final String FSB_LIMIT = "최고금리 적용 가능 금액(공시값):";
	private static final Pattern MONEY_TIER = Pattern.compile("원\\s*(이하|초과|미만|이상)|(이하|초과|미만|이상)\\s*분|초과분");
	private static final List<String> TIER_WORDS = List.of("차등", "금액별", "잔액별", "구간", "평균잔액", "월평균");

	static final String NO_CMA = "CMA 이자 계산은 아직 제공하지 않아요";
	static final String NO_BASE = "공시에 기본금리가 없어 계산할 수 없어요";
	static final String LIMITED = "최고금리를 받는 금액에 제한이 있어 구간별 계산이 필요한 상품이에요";
	static final String TIERED = "금액 구간에 따라 금리가 달라져 지금은 계산하지 않아요";

	private ParkingCalculator() {}

	record Result(long interestPreTax, long tax, long interestAfterTax) {}

	/** 계산할 수 없는 이유. 계산할 수 있으면 null. */
	static String reason(Product p) {
		if (p.baseRate() == null) {
			return NO_BASE;
		}
		StringBuilder rest = new StringBuilder();
		for (String line : (p.conditions() == null ? "" : p.conditions().replace(BOILERPLATE, "")).split("\\R")) {
			String t = line.strip();
			if (t.startsWith(FSB_LIMIT)) {
				if (!t.equals(FSB_LIMIT + " 제한없음")) {
					return LIMITED;
				}
				continue;
			}
			rest.append(t).append('\n');
		}
		String text = rest.toString();
		if (MONEY_TIER.matcher(text).find() || TIER_WORDS.stream().anyMatch(text::contains)) {
			return TIERED;
		}
		return null;
	}

	static Result calculate(long amount, int days, BigDecimal ratePercent) {
		long pre = BigDecimal.valueOf(amount).multiply(ratePercent).multiply(BigDecimal.valueOf(days))
				.divide(BigDecimal.valueOf(36_500), 0, RoundingMode.DOWN).longValueExact();
		long tax = BigDecimal.valueOf(pre).multiply(BigDecimal.valueOf(154)).divide(BigDecimal.valueOf(1000), 0,
				RoundingMode.DOWN).longValueExact();
		return new Result(pre, tax, pre - tax);
	}
}
