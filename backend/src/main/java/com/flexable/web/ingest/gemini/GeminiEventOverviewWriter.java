package com.flexable.web.ingest.gemini;

import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.SequencedSet;
import java.util.Set;
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
	 * AI 문장: 2문장 이내, 금지 표현·사실 주장 낱말 없음(종목명 안의 글자는 빼고 본다), 나온 숫자가 모두 입력에 있어야 한다
	 * (등락률·배수는 적힌 소수 그대로, 날짜는 입력의 "2026년 10월 12일"에서 나온 연·월·일 숫자로).
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
		String plain = s.replace(in.name(), " ");
		if (BANNED.stream().anyMatch(plain::contains) || CLAIMS.stream().anyMatch(plain::contains)) {
			return null;
		}
		Set<String> known = new LinkedHashSet<>();
		Stream.of(in.name(), in.period(), in.returnRate(), String.valueOf(in.windowDays()), in.marketReturn(), in.volumeRatio())
			.filter(v -> v != null)
			.forEach(t -> GeminiNewsSummarizer.numbers(t).forEach(known::addAll));
		for (SequencedSet<String> n : GeminiNewsSummarizer.numbers(s)) {
			if (!known.contains(n.getLast())) {
				return null;
			}
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
