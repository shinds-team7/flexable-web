package com.flexable.web.ingest;

import com.flexable.web.market.Board;

/**
 * 시장별 종목 목록(이름·시장·시가총액)을 주는 외부 소스.
 * 교체 방법은 PriceSource와 같다(app.ingest.instrument-source, 대체 소스는 instrument-fallback).
 */
public interface InstrumentSource {

	String source();

	/** 그 시장의 종목 전체. 순서는 상관없다. 받지 못하면 예외를 던진다. */
	InstrumentListing listing(Board board);
}
