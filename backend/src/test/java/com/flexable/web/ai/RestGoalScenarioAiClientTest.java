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
	void 프롬프트_v4는_적금_단정을_막고_숫자를_줄이라고_안내한다() {
		assertThat(RestGoalScenarioAiClient.PROMPT_VERSION).isEqualTo("goal-scenario-v4");
		assertThat(RestGoalScenarioAiClient.PROMPT).startsWith("goal-scenario-v4.")
			.contains("금리가 정해져 있어요").contains("원금이 보장돼요").contains("숫자는 꼭 필요할 때만");
	}

	@Test
	void 키가_없으면_부르지_않는다() {
		var none = new RestGoalScenarioAiClient(RestClient.builder(), new OpenAiProperties("", "https://example.com/v1", "gpt-4o-mini"));
		assertThat(none.enabled()).isFalse();
		assertThatThrownBy(() -> none.propose("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
	}
}
