package com.flexable.web.ingest.gemini;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;
import java.util.stream.Stream;

import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.EventOverviewWriter;
import com.flexable.web.market.EventDtos.OverviewInput;
import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;

/**
 * Gemini API로 사건 AI 개요를 묶어서 쓴다(decisions/2026-10-29-event-ai-summary). 응답은 JSON 배열 [{id, overview}]로 받는다.
 * 보내는 것: 이름·기간·거래일 수·방향·등락률·시장 대비·거래량 배수·DART 공시 제목뿐이다(공개 시장 자료, 회원 정보 없음).
 * AI는 주가 움직임 문장만 쓰고, 공시 문장은 서버가 입력 공시 제목으로 붙인다(check). AI가 입력에 없는 공시·사건을 지어내지 못하게 한다.
 * 네이버 뉴스 기사는 보내지 않는다(검색 API 특약의 AI 입력 금지). 호출·키 가리기는 GeminiClient가 하고, 프롬프트·응답 본문은 로그에 남기지 않는다.
 */
public class GeminiEventOverviewWriter implements EventOverviewWriter {

	/** 완성된 개요(AI 문장 + 서버 공시 문장) 상한 */
	static final int MAX_CHARS = 160;
	static final int MAX_SENTENCES = 3;
	/** AI가 쓰는 주가 문장 상한. 공시 문장 한 개를 붙여도 3문장 안에 들게 한다 */
	static final int MAX_AI_SENTENCES = 2;
	/**
	 * 들어가면 개요를 버리는 말. 원인 단정(공시와 주가를 원인·결과로 잇기), 권유·매매, 전망, 없는 기능 암시(01 §7, 02 §9).
	 * 종목명 안의 글자는 빼고 본다.
	 */
	static final List<String> BANNED = List.of(
			"때문", "덕분", "덕에", "영향", "원인", "이유", "인해", "탓", "호재", "악재", "견인", "이끌", "끌어",
			"추천", "권유", "권해", "매수", "매도", "사세요", "파세요", "사야", "팔아야", "투자하", "투자해", "목표가", "저평가", "고평가",
			"전망", "예상", "예측", "기대", "우려", "앞으로", "향후", "가능성",
			"AI 분석", "AI 추천", "무조건", "반드시", "확실");
	/**
	 * AI 문장에 들어가면 버리는 사실 주장 낱말: 공시·기사·발표나 회사·시장 사건을 말하는 말. 입력에 없는 공시·사건을 지어내는 것을 막는다.
	 * 공시는 서버가 입력 제목으로만 붙이므로 AI 문장에는 공시 이야기가 없어야 한다. 종목명 안의 글자는 빼고 본다.
	 * 낱말 목록이라 여기 없는 사건 표현(예: 업황)은 막지 못한다(결정 기록의 알려진 한계).
	 */
	static final List<String> CLAIMS = List.of(
			"공시", "발표", "소식", "뉴스", "보도", "기사", "공고", "보고서",
			"실적", "매출", "영업이익", "순이익", "적자", "흑자", "계약", "수주", "공급", "증자", "감자", "합병", "인수", "분할", "매각", "배당",
			"자사주", "자기주식", "상장", "승인", "허가", "임상", "출시", "특허", "소송", "제재", "사고", "최대주주",
			"금리", "환율", "물가", "정책", "규제", "정부", "선거", "전쟁", "관세", "이슈", "루머");
	/** 오름·내림을 말하는 낱말. 바로 앞 등락률의 부호와 맞아야 한다 */
	static final List<String> UP = List.of("올랐", "오른", "올라", "상승", "뛰었", "뛴");
	static final List<String> DOWN = List.of("내렸", "내린", "내려", "하락", "떨어", "빠졌", "빠진");
	/** 숫자 하나와 붙은 부호·단위. 단위: % · 배 · 거래일 · 년 · 월 · 일(없으면 맨 숫자) */
	private static final Pattern TOKEN = Pattern.compile("([+\\-−]?)(\\d+(?:,\\d{3})*(?:\\.\\d+)?)\\s*(%|배|거래일|년|월|일)?");
	/** 입력 기간의 날짜("2026년 10월 12일") */
	private static final Pattern KOREAN_DATE = Pattern.compile("(\\d{4})년 (\\d{1,2})월 (\\d{1,2})일");
	/** 문장 나누기: 마침표·물음표·느낌표 뒤 공백 */
	private static final Pattern SENTENCE_SPLIT = Pattern.compile("(?<=[.!?])\\s+");
	/** 종목명 자리 표시(이름 안 글자가 다른 검사에 걸리지 않게 바꿔 둔다) */
	private static final String NAME_MARK = "\u0001";

	static final String INSTRUCTION = """
			너는 주가가 크게 움직인 지난 사건을 처음 투자를 공부하는 사람에게 짧게 정리하는 편집자다. 입력 배열의 사건마다 주가 움직임만 한국어 1~2문장(120자 이내)으로 쓴다.
			- 이름·기간·등락률·같은 기간 시장 전체 등락률·거래량 배수만 쓴다. 숫자는 입력에 적힌 그대로 쓰고(예: +4.2%, 3.1배), 날짜는 "10월 12일"처럼 쓴다. 숫자를 새로 계산하거나 만들지 않는다.
			- 공시·뉴스·발표·실적·계약 같은 회사나 시장의 사건은 쓰지 않는다. 공시 문장은 따로 붙인다(disclosures는 참고만 하고 문장에 넣지 않는다).
			- 움직임의 원인을 말하지 않는다("때문에", "영향으로", "덕분에", "원인", "호재", "악재"를 쓰지 않는다). scope가 MARKET이면 특정 회사가 아닌 시장 전체 움직임으로만 쓴다.
			- 앞으로의 주가, 전망·예상, 사거나 팔라는 말, 추천을 쓰지 않는다.
			- "~했어요"체로 쓰고 이모지·따옴표를 쓰지 않는다. 입력의 id를 그대로 돌려준다.
			""";

	private final GeminiClient gemini;

	public GeminiEventOverviewWriter(RestClient http, String baseUrl, String apiKey, String model) {
		this.gemini = new GeminiClient(http, baseUrl, apiKey, model);
	}

	@Override
	public boolean enabled() {
		return gemini.enabled();
	}

	@Override
	public List<OverviewResult> write(List<OverviewTarget> batch) {
		if (!enabled()) {
			throw new IllegalStateException("GEMINI_API_KEY가 비어 있어요");
		}
		if (batch.isEmpty()) {
			return List.of();
		}
		Map<Long, OverviewTarget> byId = new LinkedHashMap<>();
		List<Map<String, Object>> input = new ArrayList<>();
		for (OverviewTarget t : batch) {
			byId.put(t.input().id(), t);
			input.add(request(t.input()));
		}
		List<OverviewResult> out = new ArrayList<>();
		String reply = gemini.generate(INSTRUCTION, GeminiClient.toJson(input), GeminiClient.idTextSchema("overview"));
		for (Map<?, ?> row : GeminiClient.parseRows(reply)) {
			if (!(row.get("id") instanceof Number n) || !byId.containsKey(n.longValue())) {
				continue;
			}
			OverviewTarget t = byId.remove(n.longValue());
			String text = check(row.get("overview") instanceof String s ? s : null, t.input());
			out.add(new OverviewResult(t.input().id(), t.inputHash(), text, gemini.model(), false));
		}
		return out;
	}

	/** 사건 하나의 요청 값. 비어 있는 칸(시장 대비·거래량 배수·공시)은 넣지 않는다 */
	static Map<String, Object> request(OverviewInput in) {
		Map<String, Object> m = new LinkedHashMap<>();
		m.put("id", in.id());
		m.put("scope", in.scope());
		m.put("name", in.name());
		m.put("period", in.period());
		m.put("windowDays", in.windowDays());
		m.put("direction", "RISE".equals(in.direction()) ? "올랐음" : "내렸음");
		m.put("returnRate", in.returnRate());
		if (in.marketReturn() != null) {
			m.put("marketReturn", in.marketReturn());
		}
		if (in.volumeRatio() != null) {
			m.put("volumeRatio", in.volumeRatio());
		}
		if (!in.disclosures().isEmpty()) {
			m.put("disclosures", in.disclosures());
		}
		return m;
	}

	/**
	 * AI 문장을 검사하고 서버 공시 문장을 붙여 개요를 완성한다. 통과하면 완성된 개요, 아니면 null(상세에 개요 칸이 보이지 않는다).
	 * AI 문장: 2문장 이내, 금지 표현·사실 주장 낱말 없음(종목명 안의 글자는 빼고 본다), 숫자는 칸마다 입력 값과 같아야 한다(valuesMatch).
	 * 하이픈 빼기(-4.2%)는 화면과 같은 빼기 기호(−4.2%)로 바꿔 저장한다.
	 * 공시 문장: 입력 공시 제목으로 서버가 만든다(disclosureSentence). 붙인 뒤 160자를 넘으면 제목 없이 건수만 쓰고, 그래도 넘으면 버린다.
	 */
	public static String check(String text, OverviewInput in) {
		if (text == null) {
			return null;
		}
		String s = text.strip().replaceAll("\\s+", " ");
		if (s.isEmpty() || s.length() > MAX_CHARS || GeminiNewsSummarizer.sentences(s) > MAX_AI_SENTENCES) {
			return null;
		}
		s = s.replaceAll("-(?=\\d)", "−"); // 하이픈 빼기를 화면과 같은 빼기 기호로
		String plain = s.replace(in.name(), NAME_MARK);
		if (BANNED.stream().anyMatch(plain::contains) || CLAIMS.stream().anyMatch(plain::contains)) {
			return null;
		}
		if (!valuesMatch(plain, in)) {
			return null;
		}
		if (in.disclosures().isEmpty()) {
			return s;
		}
		String full = s + " " + disclosureSentence(in.disclosures(), true);
		if (full.length() > MAX_CHARS) {
			full = s + " " + disclosureSentence(in.disclosures(), false);
		}
		return full.length() <= MAX_CHARS && GeminiNewsSummarizer.sentences(full) <= MAX_SENTENCES ? full : null;
	}

	/**
	 * AI 문장의 숫자를 칸마다 입력 값과 맞춘다(모든 칸의 숫자를 한 집합에 모아 보면 다른 칸의 값이나 틀린 부호가 통과한다, PR 리뷰).
	 * - 등락률(%): 부호까지 같아야 한다. 부호 없는 %는 버린다. 종목 사건에서 문장 앞쪽(이 % 앞, 같은 문장 안)에 "시장"이 있고 종목명이 없으면
	 *   같은 기간 시장 대비, 아니면 종목 등락률과 맞춘다. 시장 사건은 늘 등락률과 맞춘다.
	 * - 바로 뒤(다음 %나 문장 끝까지)의 오름·내림 낱말이 부호와 반대면 버린다("−4.2% 올랐어요").
	 * - 배: 거래량 배수와 같아야 한다. 거래일: 거래일 수와 같아야 한다.
	 * - 년·월·일: 기간의 시작일·마지막 날 것이어야 하고, "10월 12일"처럼 붙어 있으면 같은 날짜여야 한다.
	 * - 단위 없는 숫자는 종목명 안의 숫자가 글자에 붙어 있을 때만(예: 코스피200) 받는다. 그 밖(2,400선 등)은 버린다.
	 */
	static boolean valuesMatch(String plain, OverviewInput in) {
		boolean market = "MARKET".equals(in.scope());
		String stockPct = signed(in.returnRate());
		String marketPct = in.marketReturn() == null ? null : signed(in.marketReturn());
		String ratio = in.volumeRatio() == null ? null : plainNumber(in.volumeRatio().replace("배", ""));
		Set<String> years = new HashSet<>(), months = new HashSet<>(), days = new HashSet<>(), dates = new HashSet<>();
		Matcher d = KOREAN_DATE.matcher(in.period());
		while (d.find()) {
			years.add(plainNumber(d.group(1)));
			months.add(plainNumber(d.group(2)));
			days.add(plainNumber(d.group(3)));
			dates.add(plainNumber(d.group(2)) + "/" + plainNumber(d.group(3)));
		}
		Set<String> nameNumbers = new HashSet<>();
		Matcher nm = Pattern.compile("\\d+").matcher(in.name());
		while (nm.find()) {
			nameNumbers.add(plainNumber(nm.group()));
		}
		for (String sentence : SENTENCE_SPLIT.split(plain)) {
			List<int[]> pcts = new ArrayList<>(); // 이 문장의 % 위치(시작, 끝)
			Matcher t = TOKEN.matcher(sentence);
			String lastMonth = null;
			int lastMonthEnd = -1;
			while (t.find()) {
				String sign = t.group(1), value = plainNumber(t.group(2)), unit = t.group(3);
				if (unit == null) {
					boolean glued = t.start() > 0 && Character.isLetter(sentence.charAt(t.start() - 1));
					if (!sign.isEmpty() || !glued || !nameNumbers.contains(value)) {
						return false;
					}
					continue;
				}
				if (!"%".equals(unit) && !sign.isEmpty()) {
					return false;
				}
				switch (unit) {
					case "%" -> {
						if (sign.isEmpty()) {
							return false;
						}
						String before = sentence.substring(pcts.isEmpty() ? 0 : pcts.getLast()[1], t.start());
						boolean aboutMarket = !market && before.contains("시장") && !before.contains(NAME_MARK);
						String want = aboutMarket ? marketPct : stockPct;
						if (want == null || !want.equals(sign.replace('-', '−') + value)) {
							return false;
						}
						pcts.add(new int[] { t.start(), t.end() });
					}
					case "배" -> {
						if (!value.equals(ratio)) {
							return false;
						}
					}
					case "거래일" -> {
						if (!value.equals(plainNumber(String.valueOf(in.windowDays())))) {
							return false;
						}
					}
					case "년" -> {
						if (!years.contains(value)) {
							return false;
						}
					}
					case "월" -> {
						if (!months.contains(value)) {
							return false;
						}
						lastMonth = value;
						lastMonthEnd = t.end();
					}
					default -> { // 일
						if (!days.contains(value)) {
							return false;
						}
						boolean paired = lastMonth != null && sentence.substring(lastMonthEnd, t.start()).isBlank();
						if (paired && !dates.contains(lastMonth + "/" + value)) {
							return false;
						}
					}
				}
			}
			// 등락률 바로 뒤의 오름·내림 낱말이 부호와 반대면 버린다
			for (int i = 0; i < pcts.size(); i++) {
				int from = pcts.get(i)[1], to = i + 1 < pcts.size() ? pcts.get(i + 1)[0] : sentence.length();
				String after = sentence.substring(from, to);
				boolean rise = sentence.charAt(pcts.get(i)[0]) == '+';
				if (rise ? DOWN.stream().anyMatch(after::contains) : UP.stream().anyMatch(after::contains)) {
					return false;
				}
			}
		}
		return true;
	}

	/** "+4.2%" → "+4.2", "−7.5%" → "−7.5"(하이픈은 빼기 기호로) */
	private static String signed(String pct) {
		String p = pct.replace("%", "").replace('-', '−').strip();
		char sign = p.charAt(0);
		return sign == '+' || sign == '−' ? sign + plainNumber(p.substring(1)) : "+" + plainNumber(p);
	}

	/** 쉼표를 빼고 같은 값이면 같은 글자로(4.20 → 4.2는 하지 않는다: 소수 자리까지 입력과 같아야 한다) */
	private static String plainNumber(String n) {
		String v = n.replace(",", "");
		return v.contains(".") ? v : new BigDecimal(v).toPlainString();
	}

	/**
	 * 입력 공시 제목으로 만드는 공시 문장(AI가 쓰지 않는다). 제목은 점수 순 첫 공시.
	 * 예: "이 기간에 단일판매ㆍ공급계약체결 공시가 있었어요.", "이 기간에 단일판매ㆍ공급계약체결 등 공시 3건이 있었어요."
	 * withTitle이 false면 "이 기간에 공시 3건이 있었어요."
	 */
	static String disclosureSentence(List<String> titles, boolean withTitle) {
		int n = titles.size();
		if (!withTitle) {
			return "이 기간에 공시 " + n + "건이 있었어요.";
		}
		return n == 1 ? "이 기간에 " + titles.getFirst() + " 공시가 있었어요."
				: "이 기간에 " + titles.getFirst() + " 등 공시 " + n + "건이 있었어요.";
	}
}
