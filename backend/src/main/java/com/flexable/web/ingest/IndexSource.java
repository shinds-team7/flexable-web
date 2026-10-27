package com.flexable.web.ingest;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/**
 * 시장 띠 값을 주는 외부 소스(worker만 부른다). 지금은 코스피·코스닥(키움 ka20006)만 있다.
 * 해외 지수·환율(KIS)·금(KRX 금시장)은 #94에서 같은 인터페이스로 더한다.
 */
public interface IndexSource {

	/** 화면에 보이는 제공처 이름(키움증권 등). */
	String source();

	/** 이 소스가 받을 수 있는 칸. */
	Set<IndexKey> keys();

	/** from~to(포함) 일별 값. 순서는 상관없다. */
	List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to);
}
