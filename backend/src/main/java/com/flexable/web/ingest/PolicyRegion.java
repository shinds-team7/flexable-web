package com.flexable.web.ingest;

import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 청년정책이 적용되는 지역을 정한다. 기관 이름에 지역이 있으면 그 지역(주관기관 → 최상위 등록기관 → 등록기관 순),
 * 없으면 정책거주지역코드(법정 시군구 5자리)의 시·도가 하나뿐일 때 그 지역, 그 밖에는(중앙부처 등) '전국'이다.
 */
final class PolicyRegion {

	static final String NATIONWIDE = "전국";

	/** 지역 이름 → 기관 이름에 들어 있는 말. 전남광주통합특별시는 광주·전남 하나로 본다. */
	private static final Map<String, List<String>> KEYWORDS = new LinkedHashMap<>();

	/** 법정 시군구 코드 앞 두 자리 → 지역 */
	private static final Map<String, String> SIDO = new LinkedHashMap<>();

	static {
		KEYWORDS.put("서울", List.of("서울"));
		KEYWORDS.put("부산", List.of("부산"));
		KEYWORDS.put("대구", List.of("대구"));
		KEYWORDS.put("인천", List.of("인천"));
		KEYWORDS.put("광주·전남", List.of("광주", "전남", "전라남도"));
		KEYWORDS.put("대전", List.of("대전"));
		KEYWORDS.put("울산", List.of("울산"));
		KEYWORDS.put("세종", List.of("세종"));
		KEYWORDS.put("경기", List.of("경기도"));
		KEYWORDS.put("강원", List.of("강원"));
		KEYWORDS.put("충북", List.of("충청북도", "충북"));
		KEYWORDS.put("충남", List.of("충청남도", "충남"));
		KEYWORDS.put("전북", List.of("전북", "전라북도"));
		KEYWORDS.put("경북", List.of("경상북도", "경북"));
		KEYWORDS.put("경남", List.of("경상남도", "경남"));
		KEYWORDS.put("제주", List.of("제주"));
		SIDO.put("11", "서울");
		SIDO.put("26", "부산");
		SIDO.put("27", "대구");
		SIDO.put("28", "인천");
		SIDO.put("29", "광주·전남");
		SIDO.put("12", "광주·전남");
		SIDO.put("46", "광주·전남");
		SIDO.put("30", "대전");
		SIDO.put("31", "울산");
		SIDO.put("36", "세종");
		SIDO.put("41", "경기");
		SIDO.put("42", "강원");
		SIDO.put("51", "강원");
		SIDO.put("43", "충북");
		SIDO.put("44", "충남");
		SIDO.put("45", "전북");
		SIDO.put("52", "전북");
		SIDO.put("47", "경북");
		SIDO.put("48", "경남");
		SIDO.put("50", "제주");
	}

	private PolicyRegion() {
	}

	/** @param instNames 주관기관·최상위 등록기관·등록기관 이름(앞에 있을수록 우선, null 가능) */
	static String resolve(String zipCd, String... instNames) {
		for (String name : instNames) {
			String region = fromName(name);
			if (region != null) {
				return region;
			}
		}
		return fromZip(zipCd);
	}

	private static String fromName(String name) {
		if (name == null) {
			return null;
		}
		// "정부산하기관및위원회" 안의 "부산"처럼 지역이 아닌 말을 먼저 뺀다
		name = name.replace("정부산하", "");
		for (Map.Entry<String, List<String>> e : KEYWORDS.entrySet()) {
			for (String word : e.getValue()) {
				if (name.contains(word)) {
					return e.getKey();
				}
			}
		}
		return null;
	}

	private static String fromZip(String zipCd) {
		if (zipCd == null || zipCd.isBlank()) {
			return NATIONWIDE;
		}
		Set<String> regions = new LinkedHashSet<>();
		for (String code : zipCd.split(",")) {
			String c = code.strip();
			if (c.length() >= 2) {
				regions.add(SIDO.getOrDefault(c.substring(0, 2), "?"));
			}
		}
		return regions.size() == 1 && !regions.contains("?") ? regions.iterator().next() : NATIONWIDE;
	}
}
