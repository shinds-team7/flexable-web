package com.flexable.web.ingest;

import java.time.LocalDate;
import java.util.List;

/**
 * 일봉을 주는 외부 시세 소스(worker만 부른다). 구현을 바꾸려면 이 인터페이스를 구현하고
 * IngestConfig의 switch에 이름을 추가한 뒤 app.ingest.price-source(MARKET_PRICE_SOURCE) 값을 바꾼다.
 */
public interface PriceSource {

	/** 화면 출처 표시에 쓰는 이름. */
	String source();

	/** from~to(포함) 거래일 종가. 순서는 상관없고, 수정주가를 우선한다. */
	List<DailyBar> dailyBars(String code, LocalDate from, LocalDate to);
}
