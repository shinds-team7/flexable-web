package com.flexable.web.ingest.gemini;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * Gemini API(generateContent) 호출. 소식 요약(GeminiNewsSummarizer)과 사건 AI 개요(GeminiEventOverviewWriter)가 같이 쓴다.
 * 키는 헤더(x-goog-api-key)로 보내고, 오류 메시지에 키가 들어가면 ***로 가린다. 프롬프트·응답 본문은 로그에 남기지 않는다.
 */
final class GeminiClient {

	static final JsonMapper JSON = JsonMapper.builder().build();

	private final RestClient http;
	private final String baseUrl;
	private final String apiKey;
	private final String model;

	GeminiClient(RestClient http, String baseUrl, String apiKey, String model) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
		this.model = model;
	}

	boolean enabled() {
		return apiKey != null && !apiKey.isBlank();
	}

	String model() {
		return model;
	}

	/** instruction(시스템 지시)과 user(입력 JSON)로 한 번 부르고, 첫 후보의 글(responseSchema에 맞춘 JSON)을 돌려준다. */
	String generate(String instruction, String user, Map<String, Object> schema) {
		Map<String, Object> body = Map.of(
				"systemInstruction", Map.of("parts", List.of(Map.of("text", instruction))),
				"contents", List.of(Map.of("role", "user", "parts", List.of(Map.of("text", user)))),
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

	/** 응답 글을 [{...}, ...] 배열로 읽는다. 배열이 아니면 예외 */
	static List<Map<?, ?>> parseRows(String reply) {
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

	/** [{id: INTEGER, field: STRING}] 응답 형식 */
	static Map<String, Object> idTextSchema(String field) {
		return Map.of("type", "ARRAY", "items", Map.of("type", "OBJECT",
				"properties", Map.of("id", Map.of("type", "INTEGER"), field, Map.of("type", "STRING")),
				"required", List.of("id", field)));
	}

	static String toJson(Object o) {
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
