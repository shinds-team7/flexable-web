package com.flexable.web.virtualsim;

import java.util.Collection;
import java.util.Comparator;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 배치고사 공시 AI 요약의 자동 검사(decisions/2026-11-09-placement-ai-summary, policies §8-8 "공시 AI 요약"). 상태를 갖지 않는다.
 * worker가 OpenDART 공시서류원본파일 본문 글을 Gemini로 요약한 뒤 이 검사를 통과한 요약만 저장한다(사람 검수 없이 문제 화면에 나간다).
 * 회사를 찾아내지 못하게 이름·날짜·절대 금액·주식 수·가격을 막고, 문제 화면에 방향·과거 경향을 말하지 않게(결정 2-2) 금지 낱말을 막는다.
 * 숫자는 원문에 적힌 % 값(소수 자리 버림 허용)과 규모 구간 이름(PlacementDetails.bucketNames)만 허용한다.
 */
public final class PlacementSummaries {

	private PlacementSummaries() {
	}

	/**
	 * 작성 규칙(프롬프트·검사) 버전. 바꾸면 올리고, 수집 작업이 이전 버전 행을 다시 만든다(숨긴 행은 다시 만들지 않는다).
	 * v2(11-09 사용자 결정): 공시 사실과 사업 지표의 증감(늘었다·줄었다)은 싣고, 주가·평가·전망·과거 경향만 막는다. 기간 길이를 허용하고 내용 없는 요약을 막는다
	 */
	public static final String VERSION = "vsim-summary-v2";
	public static final int MAX_CHARS = 400;
	public static final int MIN_SENTENCES = 2;
	public static final int MAX_SENTENCES = 5;
	/** Gemini에 보내는 본문 글 상한(공시 하나) */
	public static final int MAX_SOURCE_CHARS = 5000;

	/** 검사에 걸린 까닭. 저장 행의 reason에 남긴다(요약 본문은 남기지 않는다) */
	public enum Reject {
		EMPTY, LENGTH, SENTENCES, BANNED, LATIN, NUMBER, PERCENT, AMOUNT, NAME, VAGUE
	}

	/** 검사 결과: 통과하면 summary(공백을 고른 글), 아니면 reject와 걸린 글자 토막 detail(다시 쓰기 안내에 쓴다. 문장 수면 그 수) */
	public record Verdict(String summary, Reject reject, String detail) {

		Verdict(String summary) {
			this(summary, null, null);
		}

		static Verdict no(Reject reject, String detail) {
			return new Verdict(null, reject, detail);
		}

		public boolean ok() {
			return summary != null;
		}
	}

	/**
	 * 들어가면 버리는 낱말(결정 2-2, 11-09 v2): 주가를 떠올리게 하는 방향 낱말, 호재·악재 같은 평가, 전망, 과거 경향·비율(PlacementGuideTextTest와 같은 낱말), 권유.
	 * 사업 지표의 변화는 늘었다·줄었다·증가·감소·흑자/적자 전환으로 쓰게 하고 막지 않는다. 공시에 늘 나오는 말(ALLOWED_PHRASES)은 빼고 본다
	 */
	public static final List<String> BANNED = List.of(
			"주가", "상승", "하락", "오르", "오른", "올라", "올랐", "오름", "내리", "내린", "내려", "내렸", "내림", "급등", "급락",
			"호재", "악재", "긍정", "부정적", "좋은 소식", "나쁜 소식", "유리", "불리", "기대", "우려",
			"전망", "예상", "예측", "앞으로", "향후", "가능성", "반드시", "확실", "무조건",
			"경향", "대체로", "보통", "비율",
			"추천", "권유", "사세요", "파세요", "목표가", "저평가", "고평가");
	/**
	 * 금지 낱말을 품었지만 공시에 늘 나오는 말: 주식 종류(보통주), 자기주식 취득 목적(주주가치 제고·주가 안정, PlacementDetails의 목적 이름),
	 * "최대주주가"처럼 주주 뒤에 조사 "가"가 붙은 꼴, "결정을 내렸다"
	 */
	static final List<String> ALLOWED_PHRASES = List.of("보통주", "주주가치", "주가 안정", "주가안정", "주주가", "결정을 내", "결정을 내린", "내린 결정");
	/** 내용 없는 요약의 말(수치 없이 "공개됐다"만 하는 글, 값을 비워 둔 "몇 %") */
	static final List<String> VAGUE_PHRASES = List.of("공개되었", "공개됐", "안내되었", "안내됐", "수치가 담", "내역이 담", "수치를 밝혔", "내용을 밝혔", "몇 %", "몇%");
	/** 허용하는 기간 길이(18개월, 2년간, 3년 동안, 90일간). 연도(4자리)·날짜는 아니다 */
	private static final Pattern DURATION = Pattern.compile("(?<![\\d.,])\\d{1,3}\\s*(개월|년간|년 동안|일간|일 동안)");
	/** 본문에 비율·금액 수치가 있는지(그러면 요약에 % 값이나 규모 구간이 하나는 있어야 한다) */
	private static final Pattern SOURCE_FIGURE = Pattern.compile("\\d+(?:\\.\\d+)?\\s*%|\\(%\\)|\\d{1,3}(?:,\\d{3}){2,}");
	/** 회사임을 나타내는 표시. 들어가면 이름을 쓴 것으로 본다 */
	static final List<String> ENTITY_MARKS = List.of("(주)", "㈜", "주식회사", "유한회사", "(유)");
	/** 표에서 이름 칸의 이름(이 칸 다음 칸의 값을 그 공시의 이름으로 모은다) */
	private static final Pattern NAME_LABEL = Pattern.compile(
			"^(성명|회사명|법인명|상호|계약상대방?|상대방|거래상대방?|상대회사|원고|피고|신청인|피신청인|대표이사|대표자|최대주주|최대주주명|양수인|양도인|인수인|매수인|매도인|"
					+ "발행대상자|배정대상자|대상자|수탁자|신탁업자|주관회사|피합병회사|합병상대회사|분할신설회사|발행회사|취득대상회사|혐의자|행위자)(명|의명칭)?$");
	/** 칸 이름 앞 번호·기호("1.", "가.", "-")는 떼고 본다 */
	private static final String LABEL_NUMBERING = "^(?:\\d+[.)]?|[가-하][.)]|[-–·])*";
	/** "(주)한빛", "한빛(주)"처럼 회사 표시가 붙은 이름 */
	private static final Pattern ENTITY_BEFORE = Pattern.compile("(?:\\(주\\)|㈜|주식회사)\\s*([가-힣A-Za-z0-9&]{2,20})");
	private static final Pattern ENTITY_AFTER = Pattern.compile("([가-힣A-Za-z0-9&]{2,20})\\s*(?:\\(주\\)|㈜)");
	/** 이름 칸 값이어도 이름이 아닌 말 */
	private static final Set<String> NOT_NAMES = Set.of("해당사항없음", "해당없음", "해당사항", "없음", "미정", "기타", "개인", "다수", "불특정다수", "당사", "회사", "본사", "정부",
			"주주", "임원", "직원", "임직원");
	private static final Pattern NUMBER = Pattern.compile("(\\d+(?:[.,]\\d+)*)\\s*(%|퍼센트)?");
	private static final Pattern SOURCE_NUMBER = Pattern.compile("\\d+(?:\\.\\d+)?");
	/** 규모 구간 밖의 절대 금액·주식 수 꼴(수십억 원, 천만 주 등) */
	private static final Pattern AMOUNT = Pattern.compile("(조|억|만|천)\\s*(원|주)|주당");
	private static final Pattern SENTENCE_END = Pattern.compile("[.!?](?=\\s|$)");

	/**
	 * 요약 검사. source: 모델에 보낸 본문 글(여기 적힌 % 값만 허용), names: 쓰면 안 되는 이름(그 회사·원문에서 찾은 상대방·사람 이름·상장사 이름).
	 * 순서: 빈 글 → 길이 → 문장 수 → 금지 낱말 → 로마자 → 숫자(규모 구간·"제3자"·기간 길이를 빼고 % 아닌 숫자가 있으면 NUMBER, 원문에 없는 %면 PERCENT)
	 * → 절대 금액 꼴 → 이름 → 내용 없음(VAGUE: 내용 없는 말이 있거나, 본문에 수치가 있는데 요약에 % 값·규모 구간이 하나도 없음)
	 */
	public static Verdict check(String text, String source, Collection<String> names) {
		if (text == null || text.isBlank()) {
			return Verdict.no(Reject.EMPTY, null);
		}
		String s = text.strip().replaceAll("\\s+", " ");
		if (s.length() > MAX_CHARS) {
			return Verdict.no(Reject.LENGTH, String.valueOf(s.length()));
		}
		int n = sentences(s);
		if (n < MIN_SENTENCES || n > MAX_SENTENCES) {
			return Verdict.no(Reject.SENTENCES, String.valueOf(n));
		}
		String words = s;
		for (String p : ALLOWED_PHRASES.stream().sorted(Comparator.comparing(String::length).reversed()).toList()) {
			words = words.replace(p, " ");
		}
		for (String w : BANNED) {
			if (words.contains(w)) {
				return Verdict.no(Reject.BANNED, w);
			}
		}
		Matcher latin = Pattern.compile("[A-Za-zＡ-Ｚａ-ｚ]+").matcher(s);
		if (latin.find()) {
			return Verdict.no(Reject.LATIN, latin.group());
		}
		String rest = s;
		boolean figure = false;
		for (String b : PlacementDetails.bucketNames().stream().sorted(Comparator.comparing(String::length).reversed()).toList()) {
			figure |= rest.contains(b);
			rest = rest.replace(b, " ");
		}
		rest = DURATION.matcher(rest.replace("제3자", " ")).replaceAll(" ");
		Matcher m = NUMBER.matcher(rest);
		while (m.find()) {
			if (m.group(2) == null) {
				return Verdict.no(Reject.NUMBER, around(rest, m.start(), m.end()));
			}
			if (!inSource(m.group(1), source)) {
				return Verdict.no(Reject.PERCENT, m.group(1) + "%");
			}
			figure = true;
		}
		Matcher amount = AMOUNT.matcher(rest);
		if (amount.find()) {
			return Verdict.no(Reject.AMOUNT, around(rest, amount.start(), amount.end()));
		}
		String squeezed = squeeze(s);
		for (String name : names) {
			String k = squeeze(name);
			if (k.length() >= 2 && squeezed.contains(k)) {
				return Verdict.no(Reject.NAME, name);
			}
		}
		for (String mark : ENTITY_MARKS) {
			if (s.contains(mark)) {
				return Verdict.no(Reject.NAME, mark);
			}
		}
		for (String v : VAGUE_PHRASES) {
			if (s.contains(v)) {
				return Verdict.no(Reject.VAGUE, v);
			}
		}
		if (!figure && source != null && SOURCE_FIGURE.matcher(source).find()) {
			return Verdict.no(Reject.VAGUE, null);
		}
		return new Verdict(s);
	}

	/** 걸린 곳과 그 뒤 몇 글자(다시 쓰기 안내용, "2025년"·"1주당" 꼴) */
	private static String around(String s, int from, int to) {
		int end = Math.min(s.length(), to + 3);
		return s.substring(Math.max(0, from - 1), end).strip();
	}

	/**
	 * 다시 쓰기 안내(모델에 한 번 더 보낼 때 붙인다). 걸린 까닭과 글자 토막을 알려 주고 고칠 방법을 말한다.
	 * 이름(NAME)도 알려 준다(그 이름은 이미 보낸 본문에 있는 것). 로그에는 이 글을 남기지 않는다
	 */
	public static String feedback(Verdict v) {
		String d = v.detail();
		return switch (v.reject()) {
			case EMPTY -> "요약이 비어 있어요. 본문의 핵심 사실을 2~5문장으로 써 주세요.";
			case LENGTH -> "글이 너무 길어요(" + d + "자). 350자 안으로 줄여 주세요.";
			case SENTENCES -> "문장이 " + d + "개예요. 2~5문장으로 써 주세요.";
			case BANNED -> "'" + d + "'는 쓸 수 없어요. 사업 지표 변화는 늘었어요·줄었어요·증가·감소로, 결정은 결정했어요로 쓰고 주가·평가·전망은 쓰지 마세요.";
			case LATIN -> "영어·로마자 '" + d + "'를 우리말로 풀어 써 주세요.";
			case NUMBER -> "'" + d + "'처럼 %나 기간 길이가 아닌 숫자(연도·날짜·분기 번호·회차·금액·주식 수)는 쓸 수 없어요. 금액은 규모 구간 이름으로, 주식 수는 기존 대비 %로 쓰세요.";
			case PERCENT -> "'" + d + "'는 본문에 없는 값이에요. 본문에 적힌 % 값을 그대로 쓰거나 소수 자리만 버리세요.";
			case AMOUNT -> "'" + d + "' 대신 규모 구간 이름을 그대로 쓰세요.";
			case NAME -> "이름('" + d + "')이 들어 있어요. 회사·상대방·사람 이름 없이 이 회사·상대 회사처럼 쓰세요.";
			case VAGUE -> "내용 없는 문장" + (d == null ? "" : "('" + d + "')") + " 대신 본문의 핵심 수치(% 값이나 규모 구간)를 넣어 무엇이 얼마나 바뀌었는지 써 주세요.";
		};
	}

	/** 문장 수: 마침표·물음표·느낌표 뒤가 공백이거나 글 끝인 곳(소수점은 세지 않는다). 끝에 부호가 없는 글도 한 문장으로 센다 */
	public static int sentences(String s) {
		Matcher m = SENTENCE_END.matcher(s);
		int n = 0, last = 0;
		while (m.find()) {
			if (!s.substring(last, m.start()).isBlank()) {
				n++;
			}
			last = m.end();
		}
		return s.substring(last).isBlank() ? n : n + 1;
	}

	/**
	 * 요약의 % 값이 원문 숫자에 있는지. 같은 수이거나 원문 수의 소수 자리를 버린 꼴이면 맞다(원문 23.45 → 23.4·23, 원문 12 → 12·12.0).
	 * 반올림(23.45 → 23.5)이나 새로 계산한 값은 틀리다
	 */
	static boolean inSource(String value, String source) {
		if (source == null) {
			return false;
		}
		String v = value.replace(",", "");
		Matcher m = SOURCE_NUMBER.matcher(source.replaceAll("(?<=\\d),(?=\\d{3})", ""));
		while (m.find()) {
			if (truncates(m.group(), v)) {
				return true;
			}
		}
		return false;
	}

	private static boolean truncates(String full, String v) {
		if (full.equals(v)) {
			return true;
		}
		String fi = full.contains(".") ? full.substring(0, full.indexOf('.')) : full;
		String ff = full.contains(".") ? full.substring(full.indexOf('.') + 1) : "";
		String vi = v.contains(".") ? v.substring(0, v.indexOf('.')) : v;
		String vf = v.contains(".") ? v.substring(v.indexOf('.') + 1) : "";
		if (!stripZeros(fi).equals(stripZeros(vi))) {
			return false;
		}
		// 원문 소수 자리를 앞에서부터 버린 꼴이어야 한다. 원문보다 자리가 많으면 뒤는 0이어야 한다
		String padded = ff + "0".repeat(Math.max(0, vf.length() - ff.length()));
		return padded.startsWith(vf);
	}

	private static String stripZeros(String i) {
		String t = i.replaceFirst("^0+(?=\\d)", "");
		return t.isEmpty() ? "0" : t;
	}

	/**
	 * 본문 글에서 쓰면 안 되는 이름을 모은다: 표의 이름 칸(성명·회사명·계약상대방·원고 등) 다음 칸 값과, "(주)한빛"·"한빛(주)"처럼 회사 표시가 붙은 이름.
	 * 본문 글의 표는 칸을 " | "로 잇는다(DART 공시서류 본문 글, DartDisclosureSource.bodyText). 원문에서 이름을 모두 찾지는 못한다(결정 기록의 알려진 한계)
	 */
	public static Set<String> names(String source) {
		Set<String> out = new LinkedHashSet<>();
		if (source == null) {
			return out;
		}
		for (String line : source.split("\n")) {
			String[] cells = line.split("\\|");
			for (int i = 0; i + 1 < cells.length; i++) {
				if (NAME_LABEL.matcher(squeeze(cells[i]).replaceFirst(LABEL_NUMBERING, "")).matches()) {
					for (String part : cells[i + 1].split("[,·ㆍ/]")) {
						addName(out, part);
					}
				}
			}
		}
		for (Pattern p : List.of(ENTITY_BEFORE, ENTITY_AFTER)) {
			Matcher m = p.matcher(source);
			while (m.find()) {
				// 표의 "취득예정주식(주)"처럼 (주)가 단위(주식 수)인 칸 이름은 이름이 아니다
				if (p == ENTITY_AFTER && m.group(1).matches(".*(주식|주식수|수량|수)$")) {
					continue;
				}
				addName(out, m.group(1));
				// "주식회사 가람개발과"처럼 뒤에 조사가 붙었으면 뗀 꼴도 막는다
				String bare = m.group(1).replaceFirst("(으로|에서|과의|와의|과|와|은|는|이|가|을|를|의|에|로)$", "");
				if (!bare.equals(m.group(1))) {
					addName(out, bare);
				}
			}
		}
		return out;
	}

	private static void addName(Set<String> out, String raw) {
		String t = raw;
		for (String mark : ENTITY_MARKS) {
			t = t.replace(mark, "");
		}
		t = t.replaceAll("\\([^)]*\\)", "").strip();
		String k = squeeze(t);
		if (k.length() < 2 || k.length() > 30 || NOT_NAMES.contains(k) || !k.matches(".*[가-힣A-Za-z].*") || k.matches("[-–—.]+")) {
			return;
		}
		out.add(t);
	}

	private static String squeeze(String s) {
		return s == null ? "" : s.replaceAll("\\s", "");
	}
}
