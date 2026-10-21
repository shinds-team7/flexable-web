package com.flexable.web.ingest.fake;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import com.flexable.web.ingest.Disclosure;
import com.flexable.web.ingest.DisclosureSource;

/**
 * 키 없이 쓰는 고정 공시(테스트·오프라인 확인용). 조회 구간 마지막 날에 공급계약 1건과 근거로 쓰지 않는 지분 보고 1건을 돌려준다.
 * 실제 공시가 아니다.
 */
public class FakeDisclosureSource implements DisclosureSource {

	private static final Map<String, String> CORP_CODES = Map.of(
			"005930", "00126380",
			"000660", "00164779",
			"035420", "00266961",
			"105560", "00688996",
			"196170", "00419702",
			"086520", "00413046");

	@Override
	public boolean enabled() {
		return true;
	}

	@Override
	public String url(Disclosure d) {
		return "https://example.com/disclosures/" + d.receiptNo();
	}

	@Override
	public Map<String, String> corpCodes() {
		return CORP_CODES;
	}

	@Override
	public List<Disclosure> disclosures(String corpCode, LocalDate from, LocalDate to) {
		String day = to.toString().replace("-", "");
		return List.of(
				new Disclosure(day + corpCode.substring(2) + "01", "단일판매ㆍ공급계약체결", "테스트 회사", to),
				new Disclosure(day + corpCode.substring(2) + "02", "임원ㆍ주요주주특정증권등소유상황보고서", "테스트 임원", to));
	}
}
