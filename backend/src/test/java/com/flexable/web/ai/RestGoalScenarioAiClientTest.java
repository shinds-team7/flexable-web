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
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
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
			.andExpect(jsonPath("$.messages[1].content").value("{\"months\":12}"))
			.andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{\\"scenarios\\":[]}","refusal":null}}],
				 "usage":{"prompt_tokens":300,"completion_tokens":200}}
				""", MediaType.APPLICATION_JSON));
		var result = client.plan("{\"months\":12}");
		assertThat(result.content()).isEqualTo("{\"scenarios\":[]}");
		assertThat(result.promptTokens()).isEqualTo(300);
		server.verify();
	}

	@Test
	void 잘림_거절_오류는_실패로_돌려준다() {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withSuccess("""
				{"choices":[{"finish_reason":"length","message":{"content":"{}","refusal":null}}]}
				""", MediaType.APPLICATION_JSON));
		assertThatThrownBy(() -> client.plan("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
		server.reset();
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withServerError().body("secret-body"));
		assertThatThrownBy(() -> client.plan("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class)
			.hasMessage("AI_FAILED").hasNoCause();
	}

	private void assertReason(String reason) {
		assertThatThrownBy(() -> client.plan("{}")).isInstanceOfSatisfying(GoalScenarioAiClient.Failed.class, e -> {
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

	/** #431: 기한마다 미리 만드는 조합. 금액 없이 기한·통계만 받고, 단계 범위(안정 0~30·균형 31~60·적극 61~100)를 안내한다. */
	@Test
	void 프롬프트_v14는_금액_없이_단계_범위_안에서_비중을_정한다() {
		assertThat(client.planPromptVersion()).isEqualTo("goal-scenario-v14");
		assertThat(RestGoalScenarioAiClient.PLAN_PROMPT).startsWith("goal-scenario-v14.")
			.contains("s1 안정: 투자 몫 0 이상 30 이하. s2 균형: 투자 몫 31 이상 60 이하. s3 적극: 투자 몫 61 이상 100 이하.")
			.contains("기한이 짧을수록 투자 몫을 범위의 아래쪽으로")
			.contains("금액은 입력에 없고 쓰지 않아요")
			.contains("금액(매달 넣을 돈, 시작 금액, 목표 금액, 기한 말 금액)·수익률·확률·배수는 쓰지 않아요")
			.contains("유형 하나하나의 설명이나 업황 전망을 되풀이하지 말고")
			.contains("기한이 1년 이하면").contains("기한이 2~3년이면").contains("마지막 1~2년")
			.contains("'적금·CMA 80%'처럼 이 시나리오의 유형 이름을 나열한 바로 뒤")
			.contains("'지난 60개월 최대 하락 23.45%'")
			.contains("'수익을 보장받지 못해요'")
			.contains("'목표 금액을 보장해요'라고 쓰지 않아요")
			.contains("정확히 세 개")
			.doesNotContain("typeRoles").doesNotContain("monthlyBudget").doesNotContain("targetAmount");
	}

	@Test
	@SuppressWarnings("unchecked")
	void 스키마는_해설_세_칸과_비중을_필수로_받고_유형별_칸은_없다() {
		var scenarios = (java.util.Map<String, Object>) ((java.util.Map<String, Object>) RestGoalScenarioAiClient.schema().get("properties")).get("scenarios");
		var scenario = (java.util.Map<String, Object>) scenarios.get("items");
		var required = (java.util.List<String>) scenario.get("required");
		assertThat(required).containsExactlyInAnyOrder("id", "title", "summary", "reason", "comparison", "fit", "mix");
		var props = (java.util.Map<String, Object>) scenario.get("properties");
		assertThat(props).containsOnlyKeys(required);
	}

	/** #417: 유형 해설은 유형 하나씩, 그 유형의 모범 예시만 붙여 세 칸으로 받는다. */
	@Test
	void 유형_해설은_그_유형의_예시만_붙여_세_칸으로_받는다() {
		assertThat(client.typeRolePromptVersion()).isEqualTo("goal-type-role-v1");
		assertThat(RestGoalScenarioAiClient.TYPE_ROLE_EXAMPLES).containsOnlyKeys(RestGoalScenarioAiClient.TYPES);
		RestGoalScenarioAiClient.TYPE_ROLE_EXAMPLES.values().forEach(e -> assertThat(e).contains("{비중}%로,"));
		// 운영에서 지워지던 "목표 금액을 보장" 대신 원금과 약정 이자로 쓴다
		assertThat(RestGoalScenarioAiClient.TYPE_ROLE_EXAMPLES.get("SAVINGS")).contains("원금과 약정 이자가 정해져").doesNotContain("보장");
		server.expect(requestTo("https://example.com/v1/chat/completions"))
			.andExpect(jsonPath("$.max_completion_tokens").value(1500))
			.andExpect(jsonPath("$.messages[0].content").value(RestGoalScenarioAiClient.TYPE_ROLE_PROMPT + RestGoalScenarioAiClient.TYPE_ROLE_EXAMPLES.get("CMA")))
			.andExpect(jsonPath("$.response_format.json_schema.name").value("goal_type_role"))
			.andExpect(jsonPath("$.response_format.json_schema.schema.required.length()").value(3))
			.andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{}","refusal":null}}]}
				""", MediaType.APPLICATION_JSON));
		client.typeRole("CMA", "{}");
		server.verify();
	}

	@Test
	void 응답_토큰_상한은_3000이다() {
		server.expect(requestTo("https://example.com/v1/chat/completions"))
			.andExpect(jsonPath("$.max_completion_tokens").value(3000))
			.andExpect(jsonPath("$.messages[0].content").value(RestGoalScenarioAiClient.PLAN_PROMPT))
			.andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{}","refusal":null}}]}
				""", MediaType.APPLICATION_JSON));
		client.plan("{}");
		server.verify();
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 성공한_호출은_버전_토큰_응답_시간만_로그에_남긴다(CapturedOutput output) {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{\\"scenarios\\":[{\\"fit\\":\\"secret-text\\"}]}","refusal":null}}],
				 "usage":{"prompt_tokens":321,"completion_tokens":4567}}
				""", MediaType.APPLICATION_JSON));
		client.plan("{\"months\":12,\"stats\":[{\"description\":\"secret-stat\"}]}");
		assertThat(output).containsPattern("goal scenario AI call: version=goal-scenario-v14 promptTokens=321 completionTokens=4567 elapsedMs=\\d+")
			.doesNotContain("secret-stat").doesNotContain("secret-text").doesNotContain("fake-test-key");
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 실패한_호출은_호출_로그를_남기지_않는다(CapturedOutput output) {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withServerError().body("secret-body"));
		assertThatThrownBy(() -> client.plan("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
		assertThat(output).doesNotContain("goal scenario AI call").doesNotContain("secret-body");
	}

	@Test
	void 키가_없으면_부르지_않는다() {
		var none = new RestGoalScenarioAiClient(RestClient.builder(), new OpenAiProperties("", "https://example.com/v1", "gpt-4o-mini"));
		assertThat(none.enabled()).isFalse();
		assertThatThrownBy(() -> none.plan("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
	}
}
