package com.flexable.web.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.net.SocketTimeoutException;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RestGoalScenarioAiClientTest {
	private MockRestServiceServer server;
	private RestGoalScenarioAiClient client;

	@BeforeEach
	void setup() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		client = new RestGoalScenarioAiClient(builder, new OpenAiProperties("fake-test-key", "https://example.com/v1", "gpt-4o-mini"));
	}

	@Test
	void 저장하지_않는_엄격한_스키마로_보내고_내용을_돌려준다() {
		server.expect(requestTo("https://example.com/v1/chat/completions"))
			.andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "Bearer fake-test-key"))
			.andExpect(jsonPath("$.model").value("gpt-4o-mini"))
			.andExpect(jsonPath("$.store").value(false)).andExpect(jsonPath("$.user").doesNotExist())
			.andExpect(jsonPath("$.response_format.json_schema.strict").value(true))
			.andExpect(jsonPath("$.response_format.json_schema.schema.properties.scenarios.items.properties.mix.required.length()").value(5))
			.andExpect(jsonPath("$.messages[1].content").value("{\"targetAmount\":15000000}"))
			.andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{\\"scenarios\\":[]}","refusal":null}}],
				 "usage":{"prompt_tokens":300,"completion_tokens":200}}
				""", MediaType.APPLICATION_JSON));
		var result = client.propose("{\"targetAmount\":15000000}");
		assertThat(result.content()).isEqualTo("{\"scenarios\":[]}");
		assertThat(result.promptTokens()).isEqualTo(300);
		server.verify();
	}

	@Test
	void 잘림_거절_오류는_실패로_돌려준다() {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withSuccess("""
				{"choices":[{"finish_reason":"length","message":{"content":"{}","refusal":null}}]}
				""", MediaType.APPLICATION_JSON));
		assertThatThrownBy(() -> client.propose("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
		server.reset();
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withServerError().body("secret-body"));
		assertThatThrownBy(() -> client.propose("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class)
			.hasMessage("AI_FAILED").hasNoCause();
	}

	private void assertReason(String reason) {
		assertThatThrownBy(() -> client.propose("{}")).isInstanceOfSatisfying(GoalScenarioAiClient.Failed.class, e -> {
			assertThat(e.reason()).isEqualTo(reason);
			assertThat(e.getMessage()).isEqualTo("AI_FAILED");
			assertThat(e).hasNoCause();
		});
		server.verify();
		server.reset();
	}

	@Test
	void 실패_원인을_분류하고_본문과_키는_담지_않는다() {
		String url = "https://example.com/v1/chat/completions";
		server.expect(requestTo(url)).andRespond(withServerError().body("secret-body"));
		assertReason("HTTP_500");
		server.expect(requestTo(url)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("secret-body"));
		assertReason("HTTP_429");
		server.expect(requestTo(url)).andRespond(withException(new SocketTimeoutException("secret-body")));
		assertReason("TIMEOUT");
		server.expect(requestTo(url)).andRespond(withException(new IOException("secret-body")));
		assertReason("NETWORK");
		server.expect(requestTo(url)).andRespond(withSuccess("""
				{"choices":[{"finish_reason":"length","message":{"content":"{}","refusal":null}}]}
				""", MediaType.APPLICATION_JSON));
		assertReason("TRUNCATED");
		server.expect(requestTo(url)).andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":null,"refusal":"no"}}]}
				""", MediaType.APPLICATION_JSON));
		assertReason("REFUSED");
		server.expect(requestTo(url)).andRespond(withSuccess("not json", MediaType.APPLICATION_JSON));
		assertReason("BAD_RESPONSE");
	}

	@Test
	void 프롬프트_v7은_시나리오_세_개와_유형별_해설을_안내한다() {
		assertThat(RestGoalScenarioAiClient.PROMPT_VERSION).isEqualTo("goal-scenario-v7");
		assertThat(RestGoalScenarioAiClient.PROMPT).startsWith("goal-scenario-v7.")
			.contains("정확히 세 개")
			.contains("유형마다 세 문장 이상")
			.contains("alternatives")
			.contains("앞으로 오르거나 내릴지 예측하지 않아요")
			.contains("금리가 정해져 있어요")
			.contains("'원금이 보장돼요', '보장된 금리', '확실한 수익'이라고 쓰지 않아요")
			.contains("reason: ").contains("roles: ").contains("comparison: ").contains("fit: ")
			.contains("유형을 하나씩 모두 짚어")
			.contains("'나머지 70%', '둘을 합쳐 30%'처럼 합쳤다는 말 바로 뒤에만 써요")
			.contains("'지난 60개월 최대 하락 23.45%'")
			.contains("앞으로의 수익을 예상하는 말처럼 쓰지 않아요")
			.contains("수치 바로 앞에 '월 평균', '월 변동폭', '최대 하락' 중 맞는 말을 함께 써요")
			.contains("'목표 수익'은 통계 수치와 같은 문장에 쓰지 않아요")
			.contains("다른 시나리오의 비중은 숫자로 쓰지 말고")
			.doesNotContain("최대 삼백 자")
			.doesNotContain("테마");
	}

	@Test
	@SuppressWarnings("unchecked")
	void 스키마는_해설_네_칸을_필수로_받는다() {
		var scenarios = (java.util.Map<String, Object>) ((java.util.Map<String, Object>) RestGoalScenarioAiClient.schema().get("properties")).get("scenarios");
		var scenario = (java.util.Map<String, Object>) scenarios.get("items");
		var required = (java.util.List<String>) scenario.get("required");
		assertThat(required).containsExactlyInAnyOrder("id", "title", "summary", "reason", "roles", "comparison", "fit", "mix");
		assertThat((java.util.Map<String, Object>) scenario.get("properties")).containsOnlyKeys(required);
	}

	@Test
	void 응답_토큰_상한은_6000이다() {
		server.expect(requestTo("https://example.com/v1/chat/completions"))
			.andExpect(jsonPath("$.max_completion_tokens").value(6000))
			.andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{}","refusal":null}}]}
				""", MediaType.APPLICATION_JSON));
		client.propose("{}");
		server.verify();
	}

	@Test
	void 키가_없으면_부르지_않는다() {
		var none = new RestGoalScenarioAiClient(RestClient.builder(), new OpenAiProperties("", "https://example.com/v1", "gpt-4o-mini"));
		assertThat(none.enabled()).isFalse();
		assertThatThrownBy(() -> none.propose("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
	}
}
