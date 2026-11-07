package com.flexable.web.cashcatalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.web.cashcatalog.CashCatalogDtos.Period;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/**
 * CMA(RP형·발행어음형) 예상 이자 계산(policies §12, 규칙 cma-calc-v1). DB·시계를 모르는 순수 함수다.
 * 이자 = floor(잔액 × 약정수익률(%) × 일수 ÷ 36500), 세금 = floor(이자 × 15.4%). 재투자(복리)는 반영하지 않는다.
 * 수익률이 하나로 정해진 상품(AGREED_RATE)과 원문에 보유 기간별 수익률이 적힌 상품(PERIOD_RATE)만 계산한다.
 */
final class CmaCalculator {

	static final String RULES_VERSION = "cma-calc-v1";

	static final String NO_RATE = "공시된 약정수익률이 하나로 정해져 있지 않아 계산하지 않아요";
	static final String PERIOD = "보유 기간에 따라 수익률이 달라져 지금은 계산하지 않아요";
	static final String TIERED = "금액 구간에 따라 수익률이 달라져 지금은 계산하지 않아요";

	/** "1일 ~ 15일 : 2.75%" 모양. 금액이 아니라 보유 일수로 수익률이 갈린다. */
	private static final Pattern PERIOD_LINE = Pattern.compile(
			"^\\s*(\\d+)\\s*일\\s*[~\\-]\\s*(\\d+)\\s*일\\s*[:：]\\s*(?:연\\s*)?(\\d+(?:\\.\\d+)?)\\s*%");
	/** 읽을 수 없어도 기간 구간이 있다는 표시(신한 "1- 27일: 2.45%" 등). */
	private static final Pattern PERIOD_HINT = Pattern.compile("\\d+\\s*일?\\s*[~\\-]\\s*\\d+\\s*일");

	private CmaCalculator() {}

	static ParkingCalculator.Assessment assess(Product p) {
		List<Period> periods = periods(p.conditions());
		if (periods != null) {
			return new ParkingCalculator.Assessment("PERIOD_RATE", null, List.of(), periods);
		}
		String text = p.conditions() == null ? "" : p.conditions();
		if (PERIOD_HINT.matcher(text).find()) {
			return none(PERIOD);
		}
		if (p.baseRate() == null || p.maxRate() == null || p.baseRate().compareTo(p.maxRate()) != 0) {
			return none(NO_RATE);
		}
		String reason = ParkingCalculator.reason(p);
		if (reason != null) {
			return none(reason.equals(ParkingCalculator.NO_BASE) ? NO_RATE : TIERED);
		}
		return new ParkingCalculator.Assessment("AGREED_RATE", null, List.of(), List.of());
	}

	private static ParkingCalculator.Assessment none(String reason) {
		return new ParkingCalculator.Assessment(null, reason, List.of(), List.of());
	}

	/** 보유 기간 구간표. 1일에서 시작해 빈틈없이 이어지는 두 줄 이상일 때만, 아니면 null. */
	static List<Period> periods(String conditions) {
		if (conditions == null) {
			return null;
		}
		List<Period> out = new ArrayList<>();
		for (String line : conditions.split("\\R")) {
			Matcher m = PERIOD_LINE.matcher(line);
			if (m.find()) {
				out.add(new Period(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), new BigDecimal(m.group(3))));
			}
		}
		if (out.size() < 2 || out.getFirst().fromDay() != 1) {
			return null;
		}
		for (int i = 0; i < out.size(); i++) {
			Period c = out.get(i);
			if (c.toDay() < c.fromDay() || i > 0 && c.fromDay() != out.get(i - 1).toDay() + 1) {
				return null;
			}
		}
		return List.copyOf(out);
	}

	/** days가 속한 기간의 수익률. 구간 밖이면 null. */
	static BigDecimal rateFor(List<Period> periods, int days) {
		return periods.stream().filter(p -> days >= p.fromDay() && days <= p.toDay()).map(Period::rate).findFirst().orElse(null);
	}

	static int maxDays(List<Period> periods) {
		return periods.getLast().toDay();
	}
}
