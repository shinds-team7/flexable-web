package com.flexable.web.virtualsim;

import java.util.Collection;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

/**
 * 가상 회사·사건 글 자동 검사(vsim-check-v3, decisions/2026-11-04-virtual-simulation 5·변경 기록, policies §8-5). 사람 검수 없이 통과한 글만 공개한다.
 * 순서대로 보고 처음 걸린 사유를 돌려준다(통과면 PASS). 낱말을 바꾸면 버전을 올린다(이전 버전으로 통과한 회사는 후보에서 빠진다).
 */
public final class VirtualSimChecker {

	public static final String VERSION = "vsim-check-v3";

	public enum Field { NAME, INTRO, BODY }

	public enum Reason { PASS, DIGIT, CHARSET, LENGTH, REAL_COMPANY, INSTITUTION, PERSON, BANNED, PRICE, TONE, TYPE_WORD }

	static final List<String> GROUPS = List.of("삼성", "현대", "엘지", "에스케이", "롯데", "한화", "포스코", "카카오", "네이버", "씨제이", "신세계", "두산");
	static final List<String> INSTITUTIONS = List.of("금융위원회", "금융감독원", "금감원", "한국거래소", "한국은행", "공정거래위원회", "국세청", "식약처", "국회",
			"대통령실", "테슬라", "엔비디아", "구글", "아마존", "마이크로소프트");
	static final List<String> TITLES = List.of("대표이사", "회장", "사장", "의장", "장관", "대통령", "교수", "박사");
	static final List<String> BANNED = List.of("때문", "덕분", "덕에", "영향", "원인", "이유", "인해", "탓", "호재", "악재", "견인",
			"추천", "권유", "권해", "매수", "매도", "사세요", "파세요", "사야", "팔아야", "투자하세요", "목표가", "저평가", "고평가",
			"전망", "예상", "예측", "기대", "우려", "앞으로", "향후", "가능성", "것으로 보",
			"무조건", "반드시", "확실", "보장");
	static final List<String> PRICE = List.of("주가", "증시", "상승", "하락", "급등", "급락", "오를", "올랐", "오른", "내릴", "내렸", "내린", "떨어", "폭등",
			"폭락", "상한가", "하한가", "수익률", "손실");
	static final List<String> TONE = List.of("늘었", "늘어", "늘려", "늘리", "증가", "줄었", "줄어", "줄여", "감소", "적자", "흑자", "호조", "부진", "악화", "개선",
			"대규모", "급증", "급감", "사상", "기록적", "최대", "최저");
	private static final Pattern ALLOWED = Pattern.compile("[가-힣 .,·'\"()\\-]*");
	private static final Pattern NAME = Pattern.compile("[가-힣]{2,10}");

	private final Set<String> listed;
	private final Set<String> taken;

	/**
	 * listedNames: 실제 상장사 이름(DART corpCode.xml 상장사 + instruments.name). 2자 미만은 빼고 공백·(주)·㈜·주식회사를 지워 대조한다.
	 * takenNames: 이미 후보에 있는 가상 회사 이름(같은 이름은 버린다).
	 */
	public VirtualSimChecker(Collection<String> listedNames, Collection<String> takenNames) {
		this.listed = listedNames.stream().map(VirtualSimChecker::normalize).filter(s -> s.length() >= 2).collect(Collectors.toUnmodifiableSet());
		this.taken = takenNames.stream().map(VirtualSimChecker::normalize).collect(Collectors.toCollection(HashSet::new));
	}

	/** 통과한 회사 이름을 더한다. 같은 실행에서 같은 이름이 다시 나오면 버린다 */
	public void reserve(String name) {
		taken.add(normalize(name));
	}

	static String normalize(String s) {
		return s == null ? "" : s.replace("(주)", "").replace("㈜", "").replace("주식회사", "").replaceAll("\\s", "");
	}

	/** 회사명·소개 검사. 사건 본문은 check(Field.BODY, text, category) */
	public Reason check(Field field, String text) {
		return check(field, text, null);
	}

	public Reason check(Field field, String text, VirtualSimCategory category) {
		if (text == null || text.isBlank()) {
			return Reason.LENGTH;
		}
		String t = text.strip();
		if (t.chars().anyMatch(c -> c >= '0' && c <= '9')) {
			return Reason.DIGIT;
		}
		if (!ALLOWED.matcher(t).matches()) {
			return Reason.CHARSET;
		}
		if (!length(field, t)) {
			return Reason.LENGTH;
		}
		String n = normalize(t);
		if (listed.stream().anyMatch(n::contains)) {
			return Reason.REAL_COMPANY;
		}
		if (field == Field.NAME && (listed.stream().anyMatch(l -> l.contains(n)) || GROUPS.stream().anyMatch(n::startsWith) || taken.contains(n))) {
			return Reason.REAL_COMPANY;
		}
		if (INSTITUTIONS.stream().anyMatch(n::contains)) {
			return Reason.INSTITUTION;
		}
		if (TITLES.stream().anyMatch(t::contains)) {
			return Reason.PERSON;
		}
		if (BANNED.stream().anyMatch(t::contains)) {
			return Reason.BANNED;
		}
		// "주주가"의 주가는 주가 반응 낱말이 아니다
		String priced = t.replace("주주", "");
		if (PRICE.stream().anyMatch(priced::contains)) {
			return Reason.PRICE;
		}
		if (field == Field.BODY) {
			// "최대주주"의 최대는 어조 낱말이 아니다
			String toned = t.replace("최대주주", "");
			if (TONE.stream().anyMatch(toned::contains)) {
				return Reason.TONE;
			}
			if (category != null && category.typeWords().stream().noneMatch(t::contains)) {
				return Reason.TYPE_WORD;
			}
		}
		return Reason.PASS;
	}

	/** 회사명 한글 2~10자(공백 없음), 소개 1문장 15~60자, 사건 본문 2~4문장 60~240자(공백 포함, v3). 문장은 마침표로 센다 */
	private static boolean length(Field field, String t) {
		int sentences = (int) Pattern.compile("\\.").splitAsStream(t).filter(s -> !s.isBlank()).count();
		return switch (field) {
			case NAME -> NAME.matcher(t).matches();
			case INTRO -> sentences == 1 && t.length() >= 15 && t.length() <= 60;
			case BODY -> sentences >= 2 && sentences <= 4 && t.length() >= 60 && t.length() <= 240;
		};
	}
}
