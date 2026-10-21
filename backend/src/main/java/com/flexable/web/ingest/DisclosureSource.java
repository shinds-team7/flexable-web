package com.flexable.web.ingest;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

/**
 * 사건 근거로 쓰는 공시 소스(worker만 부른다). 구현을 바꾸려면 이 인터페이스를 구현하고
 * IngestConfig의 switch에 이름을 추가한 뒤 app.ingest.disclosure-source(MARKET_DISCLOSURE_SOURCE) 값을 바꾼다.
 */
public interface DisclosureSource {

	/** 키가 없는 등으로 쓸 수 없으면 false. 이때 공시 단계는 건너뛴다. */
	boolean enabled();

	/** 공시 원문 링크(화면 근거 목록에 붙인다). */
	String url(Disclosure d);

	/** 상장 종목코드(6자리) → 공시 고유번호. */
	Map<String, String> corpCodes();

	/** from~to(포함)에 접수된 공시. */
	List<Disclosure> disclosures(String corpCode, LocalDate from, LocalDate to);
}
