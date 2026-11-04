package com.flexable.web.virtualsim;

import java.util.List;

/**
 * 가상 사건 유형(vsim-types-v2, decisions/2026-11-04-virtual-simulation 1-1). DART 공시 제목 분류 순서가 곧 선언 순서다.
 * titles: 화면에 보일 공시 제목(서버 고정, 실제 DART 보고서명 형식), keywords: 제목 낱말, typeWords: 사건 본문 필수 낱말(자동 검사 TYPE_WORD).
 */
public enum VirtualSimCategory {
	EARNINGS("실적 발표", List.of("연결재무제표기준영업(잠정)실적(공정공시)"), List.of("잠정", "실적", "매출액또는손익구조"),
			List.of("실적", "매출", "영업이익", "잠정")),
	SUPPLY_CONTRACT("공급 계약", List.of("단일판매ㆍ공급계약체결"), List.of("공급계약", "수주"), List.of("공급", "계약", "수주")),
	NEW_SHARES("유상증자", List.of("주요사항보고서(유상증자결정)"), List.of("유상증자"), List.of("유상증자")),
	BONUS_SHARES("무상증자", List.of("주요사항보고서(무상증자결정)"), List.of("무상증자"), List.of("무상증자")),
	BONDS("사채 발행", List.of("주요사항보고서(전환사채권발행결정)", "주요사항보고서(신주인수권부사채권발행결정)"),
			List.of("전환사채", "신주인수권부사채", "교환사채"), List.of("사채")),
	BUYBACK_ACQUIRE("자기주식 취득", List.of("주요사항보고서(자기주식취득결정)"), List.of("자기주식취득"), List.of("취득", "사들")),
	BUYBACK_DISPOSE("자기주식 처분", List.of("주요사항보고서(자기주식처분결정)"), List.of("자기주식처분"), List.of("처분", "매각")),
	DIVIDEND("배당", List.of("현금ㆍ현물배당결정"), List.of("배당"), List.of("배당")),
	RESTRUCTURE("합병·분할", List.of("주요사항보고서(회사합병결정)", "주요사항보고서(회사분할결정)"),
			List.of("합병", "분할", "공개매수", "영업양수", "영업양도"), List.of("합병", "분할", "공개매수", "양수", "양도")),
	FACILITY("시설·지분 투자", List.of("신규시설투자등", "유형자산취득결정", "타법인주식및출자증권취득결정"),
			List.of("신규시설투자", "유형자산", "타법인주식"), List.of("시설", "설비", "공장", "지분")),
	LEGAL("소송·사고", List.of("소송등의제기ㆍ신청(일정금액이상의청구)", "횡령ㆍ배임혐의발생"), List.of("소송", "횡령", "배임", "중대재해", "영업정지"),
			List.of("소송", "횡령", "배임", "사고", "재해", "영업정지")),
	OWNERSHIP("최대주주 변경", List.of("최대주주변경"), List.of("최대주주변경"), List.of("최대주주"));

	public static final String TYPES_VERSION = "vsim-types-v2";
	/** 뜻이 반대라 분류하지 않는 낱말 */
	private static final List<String> REVERSED = List.of("해지", "철회", "취소");

	private final String displayName;
	private final List<String> titles;
	private final List<String> keywords;
	private final List<String> typeWords;

	VirtualSimCategory(String displayName, List<String> titles, List<String> keywords, List<String> typeWords) {
		this.displayName = displayName;
		this.titles = titles;
		this.keywords = keywords;
		this.typeWords = typeWords;
	}

	public String displayName() {
		return displayName;
	}

	public List<String> titles() {
		return titles;
	}

	public List<String> typeWords() {
		return typeWords;
	}

	/**
	 * 공시 제목 → 유형. 공백·가운뎃점(·ㆍ・/)을 지우고 선언 순서대로 처음 맞는 낱말의 유형이다.
	 * 해지·철회·취소가 있으면, 또는 시설·지분 투자에 처분이 있으면 분류하지 않는다(null).
	 */
	public static VirtualSimCategory classify(String title) {
		if (title == null) {
			return null;
		}
		String t = title.replaceAll("[\\s·ㆍ・/]", "");
		if (REVERSED.stream().anyMatch(t::contains)) {
			return null;
		}
		for (VirtualSimCategory c : values()) {
			if (c.keywords.stream().anyMatch(t::contains)) {
				return c == FACILITY && t.contains("처분") ? null : c;
			}
		}
		return null;
	}
}
