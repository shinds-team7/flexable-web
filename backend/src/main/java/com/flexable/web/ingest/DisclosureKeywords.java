package com.flexable.web.ingest;

import java.util.List;
import java.util.Map;

/**
 * 공시 보고서 이름으로 사건 근거 점수를 매긴다(03 §5-4). 점수가 큰 공시부터 사건당 5건까지 근거로 둔다.
 * 임원 지분 보고처럼 거의 매일 나오는 공시는 -1(근거로 쓰지 않음), 그 밖에 키워드가 없으면 0(같은 기간 공시로만 보여 줌).
 * 보고서 이름은 띄어쓰기·가운뎃점이 제각각이라 지우고 찾는다.
 */
final class DisclosureKeywords {

	/** 근거로 쓰지 않는 공시. */
	static final int SKIP = -1;

	private static final List<String> NOISE = List.of("임원주요주주특정증권등소유상황보고서");

	private static final Map<String, Integer> WEIGHTS = Map.ofEntries(
			Map.entry("잠정", 3),
			Map.entry("공급계약", 3),
			Map.entry("유상증자", 3),
			Map.entry("무상증자", 3),
			Map.entry("감자결정", 3),
			Map.entry("합병", 3),
			Map.entry("최대주주변경", 3),
			Map.entry("거래정지", 3),
			Map.entry("횡령", 3),
			Map.entry("배임", 3),
			Map.entry("상장폐지", 3),
			Map.entry("조회공시", 3),
			Map.entry("영업정지", 3),
			Map.entry("공개매수", 3),
			Map.entry("실적", 2),
			Map.entry("자기주식", 2),
			Map.entry("전환사채", 2),
			Map.entry("신주인수권부사채", 2),
			Map.entry("교환사채", 2),
			Map.entry("분할", 2),
			Map.entry("소송", 2),
			Map.entry("배당", 2),
			Map.entry("중대재해", 2),
			Map.entry("투자판단관련주요경영사항", 2),
			Map.entry("최대주주등소유주식변동", 1),
			Map.entry("대량보유", 1),
			Map.entry("주주총회", 1),
			Map.entry("기업설명회", 1),
			Map.entry("공정공시", 1),
			Map.entry("타법인주식", 1),
			Map.entry("신규시설투자", 1),
			Map.entry("유형자산", 1));

	private DisclosureKeywords() {
	}

	static int weight(String reportName) {
		if (reportName == null) {
			return SKIP;
		}
		String s = reportName.replaceAll("[\\s·ㆍ・/]", "");
		if (NOISE.stream().anyMatch(s::contains)) {
			return SKIP;
		}
		int best = 0;
		for (Map.Entry<String, Integer> e : WEIGHTS.entrySet()) {
			if (s.contains(e.getKey())) {
				best = Math.max(best, e.getValue());
			}
		}
		return best;
	}
}
