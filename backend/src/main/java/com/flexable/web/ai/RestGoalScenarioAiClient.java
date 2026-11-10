package com.flexable.web.ai;

import java.net.SocketTimeoutException;
import java.net.http.HttpClient;
import java.net.http.HttpTimeoutException;
import java.time.Duration;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.ResourceAccessException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientResponseException;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * OpenAI로 목표 시나리오 조합을 받는다(api 프로필의 요청 중 호출 예외, 04 §8). 재시도·본문 로깅·회원 추적 필드가 없다.
 * 키·모델은 목표 안내와 같은 OpenAiProperties를 쓴다. store: false.
 */
@Component
public class RestGoalScenarioAiClient implements GoalScenarioAiClient {
	static final String PROMPT_VERSION = "goal-scenario-v8";
	/** 시나리오 전부를 합친 응답 상한. 해설은 글자 수 검사가 없어 이 값이 비용과 응답 시간을 막는다. 넘으면 TRUNCATED. */
	static final int MAX_COMPLETION_TOKENS = 6000;
	static final List<String> TYPES = List.of("SAVINGS", "CMA", "KR_INDEX_ETF", "US_INDEX_ETF", "KOSPI_TOP5");
	static final String PROMPT = """
			goal-scenario-v8. 사용자의 목표 금액과 기한에 맞춰, 아래 상품 유형 다섯 개의 비중을 정한 서로 다른 시나리오를 정확히 세 개 만들어요.
			상품 유형: SAVINGS(은행 적금, 금리 확정), CMA(수시 입출금, 예시 금리라 바뀔 수 있음), KR_INDEX_ETF(국내 대표 지수 ETF),
			US_INDEX_ETF(미국 대표 지수 ETF, 국내 상장), KOSPI_TOP5(코스피 시가총액 상위 다섯 종목에 같은 금액).
			입력의 stats는 서버가 지난 육십 개월 월 수익률로 계산한 유형별 평균·변동폭·최대 하락이에요. 이 값을 근거로 비중을 정해요.
			각 유형의 alternatives는 서버가 같은 기준으로 고른 같은 유형의 다른 상품이에요. 금액은 유형의 대표 상품으로 계산하고, alternatives는 비교 근거로만 써요.
			입력의 monthlyBudget은 사용자가 매달 넣을 수 있다고 한 돈(월 납입 가능액)이에요. null이면 받지 않은 거예요.
			서버는 시나리오마다 목표에 닿는 가장 작은 월 금액을 계산해 이 가능액과 비교하고, 가능액을 넘는 시나리오에는 따로 안내 문장을 붙여요.
			가능액이 있으면 그 돈으로 해 볼 수 있는 조합을 함께 생각해서 비중을 정하되, 그만큼 결과가 흔들릴 수 있는 위험을 분명히 밝혀요.
			어느 시나리오가 가능액 안에 든다거나 넘는다고 단정하지 않아요. 서버가 계산해서 보여 줘요.
			규칙:
			- mix의 다섯 값은 0 이상 100 이하 정수이고 합은 정확히 100이에요.
			- 시나리오끼리 위험 정도가 분명히 달라야 해요. 하나는 값이 크게 흔들리지 않는 SAVINGS·CMA 비중이 높은 조합으로 해요.
			- 기한이 짧을수록 변동이 큰 유형의 비중을 낮춰요. 한 유형에 지나치게 몰지 않아요.
			- id는 s1, s2, s3 순서예요. 한국어 '~해요'체로 쓰고, 글자 수(띄어쓰기 포함)를 꼭 지켜요:
			  title은 열다섯 자 안팎(최대 스무 자), summary는 서른 자 안팎(최대 마흔 자).
			- 사용자가 왜 이 조합을 받았는지 알 수 있게 아래 네 칸에 나눠 구체적으로 분석해요. 칸을 짧게 끝내지 않아요. 마크다운과 번호 목록은 쓰지 않아요.
			  reason: 목표 금액과 기한에 비춰 왜 이렇게 나눴는지. 두세 문장.
			  roles: 비중이 0보다 큰 유형을 하나씩 모두 짚어 유형마다 세 문장 이상. 비율과 맡는 역할, 그 비율의 근거(금리나 통계), 불리해질 수 있는 조건을 담아요. alternatives가 있으면 대표 상품과 금리나 통계가 어떻게 다른지도 말해요. 유형이 바뀔 때 줄을 바꾸고, 비중이 0인 유형은 쓰지 않아요.
			  comparison: 다른 시나리오와 위험과 비중이 무엇이 다른지. 두 문장.
			  fit: 기한이 다가올 때 주의할 점과 어떤 사람에게 맞는지. 두세 문장.
			- 숫자는 입력에 있는 값을 그대로 옮겨 쓸 때만 써요: 상품·지수 이름, 기한, 목표 금액, 월 납입 가능액, 적금·CMA 금리, 세율, 이 시나리오의 비중(예: mix의 SAVINGS가 70이면 '적금 70%'), stats와 alternatives의 금리·평균·변동폭·최대 하락.
			  stats의 값은 소수예요(0.05는 5%). '지난 60개월 최대 하락 23.45%'처럼 %로 바꿔 소수 둘째 자리까지 쓰고(23%처럼 정수로 줄이지 않아요), 지난 60개월 자료임을 밝혀요. 수치 바로 앞에 '월 평균', '월 변동폭', '최대 하락' 중 맞는 말을 함께 써요.
			  앞으로 오르거나 내릴지 예측하지 않아요. '금리가 내려가면', '시장이 크게 떨어지는 구간에는'처럼 조건과 위험으로 설명해요.
			  과거 값이라 앞으로의 수익을 예상하는 말처럼 쓰지 않아요. '기대', '예상', '전망', '노려요', '목표 수익'은 통계 수치와 같은 문장에 쓰지 않아요.
			  다른 시나리오의 비중은 숫자로 쓰지 말고 '적금 비중이 더 높아요'처럼 써요. 이 시나리오의 비중을 합친 숫자는 '나머지 70%', '둘을 합쳐 30%'처럼 합쳤다는 말 바로 뒤에만 써요. 값을 연 단위로 바꾸는 등 그 밖에 새로 계산한 숫자는 쓰지 않아요.
			  입력에 없는 금액·수익률·확률·배수(예상 수익, 매달 넣을 돈, 달성 가능성 등)는 쓰지 않아요. 서버가 따로 계산해서 보여 줘요.
			  SAVINGS·KOSPI_TOP5 같은 유형 코드는 쓰지 말고 '적금', '코스피 대형주'처럼 우리말로 써요.
			- '원금 보장', '확실히 오른다', '무조건' 같은 단정과 가입·매수 권유를 하지 않아요. 위험을 말할 때는 '수익이 보장되지 않아요', '줄어들 수 있어요'처럼 써요.
			- 적금·CMA를 설명할 때도 '원금이 보장돼요', '보장된 금리', '확실한 수익'이라고 쓰지 않아요. '적금은 금리가 정해져 있어요', '값이 크게 흔들리지 않아요'처럼 써요.
			""";
	private final RestClient http;
	private final OpenAiProperties props;
	private final JsonMapper json = JsonMapper.builder().build();

	@Autowired
	public RestGoalScenarioAiClient(OpenAiProperties props) {
		this(builder(), props);
	}

	RestGoalScenarioAiClient(RestClient.Builder builder, OpenAiProperties props) {
		this.props = props;
		this.http = builder.baseUrl(props.baseUrl().replaceAll("/+$", ""))
			.defaultHeader("Authorization", "Bearer " + props.apiKey()).build();
	}

	private static RestClient.Builder builder() {
		HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(3)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(Duration.ofSeconds(90));
		return RestClient.builder().requestFactory(factory);
	}

	@Override
	public boolean enabled() {
		return props.configured();
	}

	@Override
	public Result propose(String inputJson) {
		if (!enabled()) {
			throw new Failed("NO_KEY");
		}
		try {
			Map<String, Object> body = Map.of("model", props.model(), "temperature", 0.3, "max_completion_tokens", MAX_COMPLETION_TOKENS,
					"store", false, "messages", List.of(Map.of("role", "system", "content", PROMPT),
							Map.of("role", "user", "content", inputJson)),
					"response_format", Map.of("type", "json_schema", "json_schema",
							Map.of("name", "goal_scenarios", "strict", true, "schema", schema())));
			String raw = http.post().uri("/chat/completions").contentType(MediaType.APPLICATION_JSON)
				.body(body).retrieve().body(String.class);
			JsonNode response = json.readTree(raw);
			JsonNode choice = response.path("choices").path(0);
			if (!choice.path("message").path("refusal").isMissingNode() && !choice.path("message").path("refusal").isNull()) {
				throw new Failed("REFUSED");
			}
			if ("length".equals(choice.path("finish_reason").asString())) {
				throw new Failed("TRUNCATED");
			}
			if (!"stop".equals(choice.path("finish_reason").asString()) || !choice.path("message").path("content").isString()) {
				throw new Failed("BAD_RESPONSE");
			}
			String content = choice.path("message").path("content").asString();
			json.readTree(content);
			return new Result(content, props.model(), tokens(response.path("usage").path("prompt_tokens")),
					tokens(response.path("usage").path("completion_tokens")));
		}
		catch (Failed e) {
			throw e;
		}
		catch (RuntimeException e) {
			throw new Failed(classify(e));
		}
	}

	/** 실패를 분류만 한다. 예외 메시지에는 응답 본문이 들어갈 수 있어 쓰지 않는다. */
	private static String classify(RuntimeException e) {
		if (e instanceof RestClientResponseException response) {
			return "HTTP_" + response.getStatusCode().value();
		}
		for (Throwable t = e; t != null; t = t.getCause()) {
			if (t instanceof SocketTimeoutException || t instanceof HttpTimeoutException) {
				return "TIMEOUT";
			}
		}
		return e instanceof ResourceAccessException ? "NETWORK" : "BAD_RESPONSE";
	}

	private static Integer tokens(JsonNode node) {
		return node.isIntegralNumber() ? node.asInt() : null;
	}

	/** strict 구조화 출력은 개수·길이·합계를 강제하지 못해 웹 서버의 제안 검증(Proposals)이 맡는다. */
	static Map<String, Object> schema() {
		Map<String, Object> string = Map.of("type", "string");
		Map<String, Object> integer = Map.of("type", "integer");
		Map<String, Object> mixProps = new LinkedHashMap<>();
		TYPES.forEach(t -> mixProps.put(t, integer));
		Map<String, Object> mix = Map.of("type", "object", "additionalProperties", false, "required", TYPES, "properties", mixProps);
		List<String> required = new java.util.ArrayList<>(List.of("id", "title", "summary"));
		required.addAll(EXPLANATION_FIELDS);
		required.add("mix");
		Map<String, Object> scenarioProps = new LinkedHashMap<>(Map.of("id", string, "title", string, "summary", string, "mix", mix));
		EXPLANATION_FIELDS.forEach(f -> scenarioProps.put(f, string));
		Map<String, Object> scenario = Map.of("type", "object", "additionalProperties", false, "required", required, "properties", scenarioProps);
		return Map.of("type", "object", "additionalProperties", false, "required", List.of("scenarios"),
				"properties", Map.of("scenarios", Map.of("type", "array", "items", scenario)));
	}
}
