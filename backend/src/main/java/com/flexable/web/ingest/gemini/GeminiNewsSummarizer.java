package com.flexable.web.ingest.gemini;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.SequencedSet;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.flexable.web.ingest.NewsSummarizer;
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Gemini API(generateContent)로 소식 카드를 묶어서 요약한다. 응답은 JSON 배열 [{id, summary}]로 받는다(responseSchema).
 * 보내는 것: 정책명·정책설명(plcyExplnCn)·지원내용(plcySprtCn)뿐이다. 담당자 이름은 수집 때 이미 지웠고 회원 정보는 없다.
 * 키는 헤더(x-goog-api-key)로 보내고, 오류 메시지에 키가 들어가면 ***로 가린다. 프롬프트·응답 본문은 로그에 남기지 않는다.
 */
public class GeminiNewsSummarizer implements NewsSummarizer {

	static final int MAX_CHARS = 160;
	static final int MAX_SENTENCES = 3;
	/** 화면에 없는 기능 암시·권유 말(AGENTS.md). 들어가면 요약을 버린다 */
	static final List<String> BANNED = List.of("추천", "투자 권유", "계좌 연결", "무조건");
	/** 원문 한 칸을 이 길이까지만 보낸다(입력 토큰을 줄인다) */
	static final int SOURCE_CHARS = 700;
	private static final JsonMapper JSON = JsonMapper.builder().build();
	/** 숫자 하나: 천 단위 쉼표와 소수점까지(날짜 2026.10.01은 2026·10·01로 나뉜다) */
	private static final Pattern NUMBER = Pattern.compile("\\d+(?:,\\d{3})*(?:\\.\\d+)?");
	/** 문장 끝: 마침표·물음표·느낌표 또는 "~요"·"~다" 뒤 공백/끝 */
	private static final Pattern SENTENCE_END = Pattern.compile("[.!?。](?=\\s|$)|[요다](?=\\s*$)");

	static final String INSTRUCTION = """
			너는 청년 정책 공고를 카드에 넣을 짧은 요약으로 줄이는 편집자다. 입력 배열의 정책마다 한국어 1~2문장(최대 3문장, 160자 이내)으로 요약한다.
			- 누가 무엇을 받는지를 쓴다. 지원 금액이 원문에 있으면 원문 숫자를 그대로 넣는다(예: 월 최대 20만 원).
			- 신청 기간·나이·지역·기관은 카드에 따로 나오므로 쓰지 않는다.
			- 원문에 없는 숫자·금액·조건·기관을 만들지 않는다. 확실하지 않으면 빼고 쓴다.
			- 권유·추천·전망 문장, 이모지, 따옴표를 쓰지 않는다. "~해요"체로 쓴다.
			- 입력의 id를 그대로 돌려준다.
			""";

	private final RestClient http;
	private final String baseUrl;
	private final String apiKey;
	private final String model;

	public GeminiNewsSummarizer(RestClient http, String baseUrl, String apiKey, String model) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
		this.model = model;
	}

	@Override
	public boolean enabled() {
		return apiKey != null && !apiKey.isBlank();
	}

	@Override
	public List<SummaryResult> summarize(List<SummaryTarget> batch) {
		if (!enabled()) {
			throw new IllegalStateException("GEMINI_API_KEY가 비어 있어요");
		}
		if (batch.isEmpty()) {
			return List.of();
		}
		Map<Long, SummaryTarget> byId = new LinkedHashMap<>();
		Map<Long, String> sources = new LinkedHashMap<>();
		List<Map<String, Object>> input = new ArrayList<>();
		for (SummaryTarget t : batch) {
			String text = sourceText(t.payload());
			byId.put(t.id(), t);
			sources.put(t.id(), t.title() + " " + text);
			input.add(Map.of("id", t.id(), "title", t.title(), "text", text));
		}
		List<SummaryResult> out = new ArrayList<>();
		for (Map<?, ?> row : parseRows(call(input))) {
			if (!(row.get("id") instanceof Number n) || !byId.containsKey(n.longValue())) {
				continue;
			}
			SummaryTarget t = byId.remove(n.longValue());
			String summary = check(row.get("summary") instanceof String s ? s : null, sources.get(t.id()));
			out.add(new SummaryResult(t.id(), t.contentHash(), summary));
		}
		return out;
	}

	private String call(List<Map<String, Object>> input) {
		Map<String, Object> schema = Map.of("type", "ARRAY", "items", Map.of("type", "OBJECT",
				"properties", Map.of("id", Map.of("type", "INTEGER"), "summary", Map.of("type", "STRING")),
				"required", List.of("id", "summary")));
		Map<String, Object> body = Map.of(
				"systemInstruction", Map.of("parts", List.of(Map.of("text", INSTRUCTION))),
				"contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", toJson(input))))),
				"generationConfig", Map.of("temperature", 0.2, "responseMimeType", "application/json", "responseSchema", schema));
		String res;
		try {
			res = http.post()
				.uri(baseUrl + "/v1beta/models/{model}:generateContent", model)
				.header("x-goog-api-key", apiKey)
				.contentType(MediaType.APPLICATION_JSON)
				.body(toJson(body))
				.retrieve()
				.body(String.class);
		}
		catch (RestClientException e) {
			throw hideKey("Gemini 호출 실패: " + e.getMessage());
		}
		try {
			Map<?, ?> parsed = res == null ? null : JSON.readValue(res, Map.class);
			if (parsed != null && parsed.get("candidates") instanceof List<?> c && !c.isEmpty() && c.getFirst() instanceof Map<?, ?> first
					&& first.get("content") instanceof Map<?, ?> content && content.get("parts") instanceof List<?> parts && !parts.isEmpty()
					&& parts.getFirst() instanceof Map<?, ?> part && part.get("text") instanceof String text) {
				return text;
			}
		}
		catch (JacksonException e) {
			// 아래에서 같은 오류로 바꾼다
		}
		throw new IllegalStateException("Gemini 응답을 읽지 못했어요(후보 없음)");
	}

	private static List<Map<?, ?>> parseRows(String reply) {
		try {
			List<?> rows = JSON.readValue(reply, List.class);
			List<Map<?, ?>> out = new ArrayList<>();
			for (Object r : rows) {
				if (r instanceof Map<?, ?> m) {
					out.add(m);
				}
			}
			return out;
		}
		catch (JacksonException e) {
			throw new IllegalStateException("Gemini 응답이 JSON 배열이 아니에요");
		}
	}

	/** 원문(payload JSON)에서 요약에 쓸 칸만 꺼낸다. 없으면 빈 문자열 */
	static String sourceText(String payload) {
		try {
			Map<?, ?> row = JSON.readValue(payload, Map.class);
			StringBuilder sb = new StringBuilder();
			for (String key : List.of("plcyExplnCn", "plcySprtCn")) {
				if (row.get(key) instanceof String s && !s.isBlank()) {
					String v = s.strip().replaceAll("\\s+", " ");
					sb.append(sb.isEmpty() ? "" : " / ").append(v, 0, Math.min(SOURCE_CHARS, v.length()));
				}
			}
			return sb.toString();
		}
		catch (JacksonException e) {
			return "";
		}
	}

	/**
	 * 요약 검사. 통과하면 다듬은 요약, 아니면 null(카드에 요약 줄 없이 나간다).
	 * 160자·3문장 이내, 금지어 없음, 요약에 나온 숫자가 모두 원문(정책명 포함)에 있어야 한다(금액을 지어내는 것을 막는다).
	 * 원문 숫자는 맨 숫자와 환산값을 둘 다 받아 주고, 요약 숫자에 단위가 붙으면 환산값으로만 맞춘다
	 * (요약의 "12만"이 원문의 "12개월"에 걸리지 않게).
	 */
	static String check(String summary, String source) {
		if (summary == null) {
			return null;
		}
		String s = summary.strip().replaceAll("\\s+", " ");
		if (s.isEmpty() || s.length() > MAX_CHARS || sentences(s) > MAX_SENTENCES || BANNED.stream().anyMatch(s::contains)) {
			return null;
		}
		Set<String> known = new LinkedHashSet<>();
		numbers(source == null ? "" : source).forEach(known::addAll);
		for (SequencedSet<String> n : numbers(s)) {
			if (!known.contains(n.getLast())) {
				return null;
			}
		}
		return s;
	}

	private static int sentences(String s) {
		Matcher m = SENTENCE_END.matcher(s);
		int count = 0;
		while (m.find()) {
			count++;
		}
		return Math.max(1, count);
	}

	/**
	 * 글 속 숫자마다 그 숫자로 볼 수 있는 값들. 단위(억·만·천)가 붙으면 곱한 값도 넣어 같은 금액끼리 맞춰 본다
	 * ("20만" → {20, 200000}, "200,000" → {200000}). 마지막 값이 환산값(단위가 없으면 맨 숫자)이다. 끝의 마침표는 문장 끝이라 뗀다.
	 */
	static List<SequencedSet<String>> numbers(String s) {
		List<SequencedSet<String>> out = new ArrayList<>();
		Matcher m = NUMBER.matcher(s);
		while (m.find()) {
			String n = m.group().replace(",", "");
			while (n.endsWith(".")) {
				n = n.substring(0, n.length() - 1);
			}
			if (n.isEmpty()) {
				continue;
			}
			BigDecimal v = new BigDecimal(n);
			SequencedSet<String> values = new LinkedHashSet<>();
			values.add(v.stripTrailingZeros().toPlainString());
			String rest = s.substring(m.end()).stripLeading();
			BigDecimal unit = rest.startsWith("억") ? BigDecimal.valueOf(100_000_000L)
					: rest.startsWith("만") ? BigDecimal.valueOf(10_000L) : rest.startsWith("천") ? BigDecimal.valueOf(1_000L) : null;
			if (unit != null) {
				values.add(v.multiply(unit).stripTrailingZeros().toPlainString());
			}
			out.add(values);
		}
		return out;
	}

	private static String toJson(Object o) {
		try {
			return JSON.writeValueAsString(o);
		}
		catch (JacksonException e) {
			throw new IllegalStateException(e);
		}
	}

	private IllegalStateException hideKey(String msg) {
		return new IllegalStateException(enabled() ? msg.replace(apiKey, "***") : msg);
	}
}
