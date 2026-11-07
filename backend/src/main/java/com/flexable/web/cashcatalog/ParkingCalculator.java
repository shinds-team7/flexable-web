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

	static final String RULES_VERSION = "parking-calc-v2";
	static final long MAX_AMOUNT = 10_000_000_000L;
	static final int MAX_DAYS = 3650;

	private static final String BOILERPLATE = "구간별·우대조건을 확인해야 하며 최고금리를 전체 잔액에 적용하지 않아요.";
	private static final String FSB_LIMIT = "최고금리 적용 가능 금액(공시값):";
	// 금리 구간일 가능성이 큰 문구는 어디에 있어도 막는다
	private static final Pattern STRONG_TIER = Pattern.compile("원\\s*(이하|초과|미만)|(이하|초과|미만)\\s*분|초과분");
	private static final List<String> STRONG_WORDS = List.of("차등", "금액별", "잔액별", "구간", "기간별", "거치기간", "기간에 따른");
	// "N원 이상"·평균잔액은 우대 실적·수수료 면제 같은 조건에도 쓰인다. 그런 조건 줄이면 금리 구간으로 보지 않는다
	private static final Pattern WEAK_TIER = Pattern.compile("원\\s*이상|평균잔액|월평균|(?:일|개월|년)\\s*이상");
	private static final Pattern PERK_LINE = Pattern.compile("우대|실적|사용|이용|입금|결제|이체|수수료|면제|급여|연금|카드|충족|서비스|거래|가입|대출");
	private static final String NO_TIER_PHRASE = "금액구간에따른제한없음";

	static final String NO_CMA = "CMA 이자 계산은 아직 제공하지 않아요";
	static final String NO_BASE = "공시에 기본금리가 없어 계산할 수 없어요";
	static final String LIMITED = "최고금리를 받는 금액에 제한이 있어 구간별 계산이 필요한 상품이에요";
	static final String TIERED = "금액 구간에 따라 금리가 달라져 지금은 계산하지 않아요";

	private ParkingCalculator() {}

	record Result(long interestPreTax, long tax, long interestAfterTax) {}

	/** mode가 null이면 계산 불가(reason). BASE_RATE는 기본금리 하나, TIERED는 원문에 적힌 구간별 금리(tiers). */
	record Assessment(String mode, String reason, java.util.List<CashCatalogDtos.Tier> tiers,
			java.util.List<CashCatalogDtos.Period> periods) {}

	static Assessment assess(Product p) {
		var tiers = ParkingTiers.parse(p.conditions());
		if (tiers != null) {
			return new Assessment("TIERED", null, tiers.stream().map(t -> new CashCatalogDtos.Tier(t.upTo(), t.rate())).toList(),
					java.util.List.of());
		}
		String reason = reason(p);
		return new Assessment(reason == null ? "BASE_RATE" : null, reason, java.util.List.of(), java.util.List.of());
	}

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
		for (String line : rest.toString().split("\\n")) {
			String t = line.replace(" ", "").contains(NO_TIER_PHRASE) ? line.replaceAll("\\s", "").replace(NO_TIER_PHRASE, "") : line;
			if (STRONG_TIER.matcher(t).find() || STRONG_WORDS.stream().anyMatch(t::contains)) {
				return TIERED;
			}
			if (WEAK_TIER.matcher(t).find() && !PERK_LINE.matcher(t).find()) {
				return TIERED;
			}
		}
		return null;
	}

	/** CMA도 같은 식을 쓴다(약정수익률 하나). */
	static Result calculate(long amount, int days, BigDecimal ratePercent) {
		return finish(BigDecimal.valueOf(amount).multiply(ratePercent), days);
	}

	/** 구간 안의 금액에만 그 구간 금리를 적용한다. 구간별로 내림하지 않고 합친 뒤 한 번 내림한다. */
	static Result calculateTiered(long amount, int days, java.util.List<CashCatalogDtos.Tier> tiers) {
		BigDecimal weighted = BigDecimal.ZERO;
		for (var part : parts(amount, tiers)) {
			weighted = weighted.add(BigDecimal.valueOf(part.amount()).multiply(part.rate()));
		}
		return finish(weighted, days);
	}

	static java.util.List<CashCatalogDtos.ParkingPart> parts(long amount, java.util.List<CashCatalogDtos.Tier> tiers) {
		var out = new java.util.ArrayList<CashCatalogDtos.ParkingPart>();
		long previous = 0;
		for (var t : tiers) {
			long top = t.upTo() == null ? Long.MAX_VALUE : t.upTo();
			long inside = Math.max(0, Math.min(amount, top) - previous);
			out.add(new CashCatalogDtos.ParkingPart(t.upTo(), t.rate(), inside));
			if (t.upTo() != null) {
				previous = t.upTo();
			}
		}
		return java.util.List.copyOf(out);
	}

	private static Result finish(BigDecimal amountTimesRate, int days) {
		long pre = amountTimesRate.multiply(BigDecimal.valueOf(days))
				.divide(BigDecimal.valueOf(36_500), 0, RoundingMode.DOWN).longValueExact();
		long tax = BigDecimal.valueOf(pre).multiply(BigDecimal.valueOf(154)).divide(BigDecimal.valueOf(1000), 0,
				RoundingMode.DOWN).longValueExact();
		return new Result(pre, tax, pre - tax);
	}
}
