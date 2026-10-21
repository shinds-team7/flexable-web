package com.flexable.web.ingest.kiwoom;

/** 테스트에서 패키지 전용 계산 함수를 부르기 위한 창구. */
public final class KiwoomInstrumentSourceAccess {

	private KiwoomInstrumentSourceAccess() {
	}

	public static Long cap(Object shares, Object price) {
		return KiwoomInstrumentSource.cap(shares, price);
	}
}
