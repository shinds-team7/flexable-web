package com.flexable.web.ingest;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;
import java.util.Set;

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

	/** 공시 목록 한 쪽(page는 1부터). totalPages: 같은 조건의 전체 쪽 수(없으면 0) */
	record Page(List<Disclosure> items, int totalPages) {
	}

	/**
	 * from~to(포함) 공시 목록의 page번째 쪽(한 번 호출). 가상 시뮬레이션 전체 공시 수집(DisclosureArchiveJob)이 호출 수를 세며 쪽마다 부른다.
	 * 기본 구현은 disclosures를 한 쪽으로 돌려준다.
	 */
	default Page page(String corpCode, LocalDate from, LocalDate to, int page) {
		return page == 1 ? new Page(disclosures(corpCode, from, to), 1) : new Page(List.of(), 1);
	}

	/** 실제 상장사 이름(종목코드가 있는 회사). 가상 회사 글 검사(REAL_COMPANY)에 쓴다. 받을 수 없으면 예외 */
	default Set<String> listedNames() {
		throw new IllegalStateException("상장사 이름 목록을 받을 수 없는 공시 소스예요");
	}
}
