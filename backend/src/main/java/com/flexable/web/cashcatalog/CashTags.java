package com.flexable.web.cashcatalog;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 파킹·CMA 상품 분류 태그(policies §10). 상품명과 공시 조건 원문에 정해 둔 낱말이 있으면 붙인다.
 * 원문에 낱말이 있다는 뜻일 뿐이며 가입 자격이나 우대 적용 여부를 판정하지 않는다. 띄어쓰기는 무시한다.
 */
final class CashTags {

	/** 태그 → 낱말. 목록 순서가 응답의 태그 순서다. */
	static final Map<String, List<String>> KEYWORDS = new LinkedHashMap<>();

	static {
		KEYWORDS.put("YOUTH", List.of("청년", "사회초년생"));
		KEYWORDS.put("MILITARY", List.of("군인", "장병"));
		KEYWORDS.put("NON_FACE_TO_FACE", List.of("비대면", "방문없이"));
		KEYWORDS.put("SALARY_LINK", List.of("급여", "월급"));
		KEYWORDS.put("AUTO_TRANSFER", List.of("자동이체"));
		KEYWORDS.put("CARD_USE", List.of("카드"));
	}

	private CashTags() {
	}

	static List<String> of(String name, String conditions) {
		String text = ((name == null ? "" : name) + "\n" + (conditions == null ? "" : conditions)).replaceAll("\\s+", "");
		List<String> tags = new ArrayList<>();
		KEYWORDS.forEach((tag, words) -> {
			if (words.stream().anyMatch(text::contains)) {
				tags.add(tag);
			}
		});
		return List.copyOf(tags);
	}
}
