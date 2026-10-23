package com.flexable.web.ai;

import java.net.http.HttpClient;
import java.time.Duration;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** api 프로필의 요청 중 호출하는 예외(04 §8). 재시도·본문 로깅·회원 추적 필드가 없다. */
@Component
public class RestGoalCoachClient implements GoalCoachClient {
	static final String PROMPT_VERSION = "goal-coach-v1";
	static final String PROMPT = """
			goal-coach-v1. 목표를 모으는 행동을 한국어 '~해요'체로 안내해요.
			숫자를 쓰거나 계산하지 말고 제공된 {자리표시자}만 그대로 사용해요. 단위도 붙이지 않아요.
			한자어·고유어로 쓴 수량과 기간도 금지해요. 영문자·금융 상품·기관·종목 이름은 쓰지 않아요.
			추천·권유·가입·매매·대출·수익 보장·단정을 하지 않아요.
			실천 단계는 하루 예산, 남긴 돈 반영, 현재 속도 입력, 목표 점검 같은 행동만 다뤄요.
			REACHED는 축하와 유지, ON_TRACK은 속도 유지, BEHIND는 {dailyGap} 격차,
			NO_PACE는 저축 속도 입력, OVERDUE는 기한 새로 정하기를 안내해요.
			headline은 자리표시자를 포함해 최대 사십 자, summary는 이백 자,
			steps의 title은 이십사 자, detail은 백이십 자 이내예요. steps는 정확히 세 개예요.
			""";
	private final RestClient http;
	private final OpenAiProperties props;
	private final JsonMapper json = JsonMapper.builder().build();

	@Autowired
	public RestGoalCoachClient(OpenAiProperties props) {
		this(builder(), props);
	}

	RestGoalCoachClient(RestClient.Builder builder, OpenAiProperties props) {
		this.props = props;
		this.http = builder.baseUrl(props.baseUrl().replaceAll("/+$", ""))
			.defaultHeader("Authorization", "Bearer " + props.apiKey()).build();
	}

	private static RestClient.Builder builder() {
		HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(3)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(Duration.ofSeconds(20));
		return RestClient.builder().requestFactory(factory);
	}

	@Override
	public boolean enabled() {
		return props.configured();
	}

	@Override
	public Result generate(String factsJson, List<String> placeholders) {
		if (!enabled()) {
			throw new Failed();
		}
		try {
			Map<String, Object> body = Map.of("model", props.model(), "temperature", 0.4, "max_completion_tokens", 600,
					"store", false, "messages", List.of(Map.of("role", "system", "content", PROMPT),
							Map.of("role", "user", "content", factsJson + "\n사용 가능한 자리표시자: " + String.join(", ", placeholders))),
					"response_format", Map.of("type", "json_schema", "json_schema",
							Map.of("name", "goal_coach", "strict", true, "schema", schema())));
			String raw = http.post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON)
				.body(body).retrieve().body(String.class);
			JsonNode response = json.readTree(raw);
			JsonNode choice = response.path("choices").path(0);
			if (!"stop".equals(choice.path("finish_reason").asString())
					|| !choice.path("message").path("content").isString()
					|| !choice.path("message").path("refusal").isMissingNode()
							&& !choice.path("message").path("refusal").isNull()) {
				throw new Failed();
			}
			String content = choice.path("message").path("content").asString();
			json.readTree(content);
			return new Result(content, props.model(),
					tokens(response.path("usage").path("prompt_tokens")),
					tokens(response.path("usage").path("completion_tokens")));
		}
		catch (RuntimeException e) {
			throw new Failed();
		}
	}

	private static Integer tokens(JsonNode node) {
		return node.isIntegralNumber() ? node.asInt() : null;
	}

	/** strict 구조화 출력은 지원하는 JSON Schema 키워드가 제한적이라 개수(3개)·길이는 GoalCoachText 검사가 맡는다. */
	static Map<String, Object> schema() {
		Map<String, Object> string = Map.of("type", "string");
		Map<String, Object> step = Map.of("type", "object", "additionalProperties", false,
				"required", List.of("title", "detail"), "properties", Map.of("title", string, "detail", string));
		return Map.of("type", "object", "additionalProperties", false,
				"required", List.of("headline", "summary", "steps"), "properties",
				Map.of("headline", string, "summary", string, "steps",
						Map.of("type", "array", "items", step)));
	}
}
