package com.flexable.web.ai;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.jsonPath;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RestGoalCoachClientTest {
	private MockRestServiceServer server;
	private RestGoalCoachClient client;

	@BeforeEach
	void setup() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		client = new RestGoalCoachClient(builder, new OpenAiProperties("fake-test-key", "https://example.com/v1", "gpt-4o-mini"));
	}

	@Test
	void sendsStrictSchemaWithoutStorageOrUserAndReturnsTokens() {
		server.expect(requestTo("https://example.com/v1/chat/completions"))
			.andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "Bearer fake-test-key"))
			.andExpect(content().contentType(MediaType.APPLICATION_JSON))
			.andExpect(jsonPath("$.model").value("gpt-4o-mini"))
			.andExpect(jsonPath("$.store").value(false)).andExpect(jsonPath("$.user").doesNotExist())
			.andExpect(jsonPath("$.max_completion_tokens").value(600)).andExpect(jsonPath("$.temperature").value(0.4))
			.andExpect(jsonPath("$.response_format.type").value("json_schema"))
			.andExpect(jsonPath("$.response_format.json_schema.strict").value(true))
			.andExpect(jsonPath("$.response_format.json_schema.schema.additionalProperties").value(false))
			.andExpect(jsonPath("$.response_format.json_schema.schema.properties.steps.minItems").doesNotExist())
			.andExpect(jsonPath("$.messages[1].content").value("{\"amount\":10000}\n사용 가능한 자리표시자: {amount}"))
			.andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{}","refusal":null}}],
				 "usage":{"prompt_tokens":100,"completion_tokens":20}}
				""", MediaType.APPLICATION_JSON));
		var result = client.generate("{\"amount\":10000}", List.of("{amount}"));
		assertThat(result.content()).isEqualTo("{}");
		assertThat(result.promptTokens()).isEqualTo(100);
		assertThat(result.completionTokens()).isEqualTo(20);
		server.verify();
	}

	@Test
	void httpErrorDoesNotRetryOrExposeResponse() {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withServerError().body("secret-body"));
		assertThatThrownBy(() -> client.generate("{}", List.of())).isInstanceOf(GoalCoachClient.Failed.class)
			.hasMessage("AI_FAILED").hasNoCause();
		server.verify();
	}

	@Test
	void rejectsMalformedEnvelopeTruncationAndRefusal() {
		for (String response : List.of("not-json", "{}", "null",
				"{\"choices\":[{\"finish_reason\":\"length\",\"message\":{\"content\":\"{}\"}}]}",
				"{\"choices\":[{\"finish_reason\":\"stop\",\"message\":{\"content\":\"{}\",\"refusal\":\"거절\"}}]}")) {
			server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withSuccess(response, MediaType.APPLICATION_JSON));
			assertThatThrownBy(() -> client.generate("{}", List.of())).isInstanceOf(GoalCoachClient.Failed.class);
			server.verify();
			server.reset();
		}
	}

	@Test
	void unconfiguredClientNeverCallsNetworkAndDoesNotPrintKey() {
		var props = new OpenAiProperties("", "", "");
		assertThat(new RestGoalCoachClient(RestClient.builder(), props).enabled()).isFalse();
		assertThatThrownBy(() -> new RestGoalCoachClient(RestClient.builder(), props).generate("{}", List.of()))
			.isInstanceOf(GoalCoachClient.Failed.class);
		assertThat(props.model()).isEqualTo("gpt-4o-mini");
		assertThat(new OpenAiProperties("fake-secret", "", "").toString()).doesNotContain("fake-secret");
	}
}
