package com.flexable.web.market;

/**
 * 시장 띠 칸(decisions/2026-10-26-invest-insight-redesign ⑤). 선언 순서가 화면 순서다. 등락률로 정렬하지 않는다(PRD §5).
 * scale: value의 소수 자릿수(지수·환율 2, 금 0).
 */
public enum IndexKey {
	KOSPI("코스피", "INDEX", "POINT", 2),
	KOSDAQ("코스닥", "INDEX", "POINT", 2),
	NASDAQ100("나스닥100", "INDEX", "POINT", 2),
	SP500("S&P500", "INDEX", "POINT", 2),
	DJIA("다우존스", "INDEX", "POINT", 2),
	NIKKEI225("니케이225", "INDEX", "POINT", 2),
	GOLD("금", "COMMODITY", "KRW_PER_GRAM", 0),
	USDKRW("원/달러", "FX", "KRW_PER_USD", 2),
	JPYKRW("원/엔(100엔)", "FX", "KRW_PER_100JPY", 2);

	private final String label;
	private final String kind;
	private final String unit;
	private final int scale;

	IndexKey(String label, String kind, String unit, int scale) {
		this.label = label;
		this.kind = kind;
		this.unit = unit;
		this.scale = scale;
	}

	public String label() {
		return label;
	}

	public String kind() {
		return kind;
	}

	public String unit() {
		return unit;
	}

	public int scale() {
		return scale;
	}
}
