package com.flexable.web.ingest.youthcenter;

import java.util.ArrayList;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

/**
 * 법정동 코드 앞 2자리(시도) → 화면 지역 이름(src/data/news.ts REGIONS와 같은 이름).
 * 강원·전북은 특별자치도 전환으로 새 코드(51·52)가 생겨 옛 코드(42·45)와 함께 받는다.
 * 광주·전남은 온통청년 응답(2026-10-21 확인)에서 옛 코드(29·46) 대신 통합 코드 12로 온다. 121xx(구 5개)는 광주, 나머지(시·군 22개)는
 * 전남으로 본다(개수가 맞아 추정, 공식 코드표 미확인).
 */
final class Regions {

	static final Map<String, String> SIDO = Map.ofEntries(
			Map.entry("11", "서울"), Map.entry("26", "부산"), Map.entry("27", "대구"), Map.entry("28", "인천"), Map.entry("29", "광주"),
			Map.entry("30", "대전"), Map.entry("31", "울산"), Map.entry("36", "세종"), Map.entry("41", "경기"), Map.entry("42", "강원"),
			Map.entry("51", "강원"), Map.entry("43", "충북"), Map.entry("44", "충남"), Map.entry("45", "전북"), Map.entry("52", "전북"),
			Map.entry("46", "전남"), Map.entry("47", "경북"), Map.entry("48", "경남"), Map.entry("50", "제주"));

	static final Set<String> ALL = Set.copyOf(SIDO.values());

	private Regions() {
	}

	/** "11110,11140,41110" → [서울, 경기]. 비었거나 알 수 없는 코드뿐이면 null(원문에서 확인 못 함). 순서는 화면 지역 순서. */
	static List<String> fromZipCodes(String zipCd) {
		if (zipCd == null || zipCd.isBlank()) {
			return null;
		}
		Set<String> found = new LinkedHashSet<>();
		for (String code : zipCd.split(",")) {
			String c = code.trim();
			if (c.length() < 2) {
				continue;
			}
			String sido = c.substring(0, 2);
			if ("12".equals(sido)) {
				found.add(c.startsWith("121") ? "광주" : "전남");
			}
			else if (SIDO.containsKey(sido)) {
				found.add(SIDO.get(sido));
			}
		}
		if (found.isEmpty()) {
			return null;
		}
		List<String> ordered = new ArrayList<>();
		for (String name : ORDER) {
			if (found.contains(name)) {
				ordered.add(name);
			}
		}
		return ordered;
	}

	private static final List<String> ORDER = List.of("서울", "경기", "인천", "부산", "대구", "광주", "대전", "울산", "세종", "강원", "충북", "충남",
			"전북", "전남", "경북", "경남", "제주");
}
