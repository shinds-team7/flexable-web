package com.flexable.web.ingest;

import java.time.LocalDate;
import java.util.List;
import java.util.Set;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/**
 * 시장 띠 값을 주는 외부 소스(worker만 부른다). 코스피·코스닥(키움 ka20006), 채권지수·금(KRX), 환율 4개(한국수출입은행), 가짜(8칸).
 * IndexSyncJob은 칸마다 그 칸을 받을 수 있는 첫 소스를 쓴다. 키가 없으면 keys()가 비어 그 칸은 건너뛴다.
 */
public interface IndexSource {

	/** 화면에 보이는 제공처 이름(키움증권 등). */
	String source();

	/** 이 소스가 받을 수 있는 칸. */
	Set<IndexKey> keys();

	/** from~to(포함) 일별 값. 순서는 상관없다. */
	List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to);
}
