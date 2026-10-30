package com.flexable.web.market;

import java.time.LocalDate;
import java.util.Arrays;
import java.util.Optional;

/** 주가 차트 기간. 마지막 거래일에서 months개월 거슬러 간 날 이후(포함)의 첫 거래일부터다. */
public enum PricePeriod {
	M3("3M", 3), M6("6M", 6), Y1("1Y", 12), Y3("3Y", 36);

	private final String code;
	private final int months;

	PricePeriod(String code, int months) {
		this.code = code;
		this.months = months;
	}

	public String code() {
		return code;
	}

	public int months() {
		return months;
	}

	/** 마지막 거래일 asOf의 이 기간 시작 기준일(이날 이후 첫 거래일부터 보인다). 화면 조회와 사건 AI 개요 대상이 같이 쓴다 */
	public LocalDate from(LocalDate asOf) {
		return asOf.minusMonths(months);
	}

	public static Optional<PricePeriod> parse(String code) {
		return Arrays.stream(values()).filter(p -> p.code.equals(code)).findFirst();
	}
}
