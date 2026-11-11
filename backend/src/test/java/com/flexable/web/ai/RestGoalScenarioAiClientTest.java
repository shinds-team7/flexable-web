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
	void 프롬프트_v10은_시나리오_세_개와_유형별_칸과_월_납입_가능액을_안내한다() {
		assertThat(RestGoalScenarioAiClient.PROMPT_VERSION).isEqualTo("goal-scenario-v10");
		assertThat(RestGoalScenarioAiClient.PROMPT).startsWith("goal-scenario-v10.")
			// #398: 만기 뒤 남은 달, 기한 말 하락 조건문, 기한 길이별 주의점, 서버가 보여 주는 숫자, 늘린 부정문 예시
			.contains("남은 달의 적금 몫을 CMA 예시 금리로 이어 가고")
			.contains("기한 말 근처에 오면 기한 말 금액이 넣은 돈보다 적을 수 있어요")
			.contains("기한이 1년 이하면").contains("기한이 2~3년이면")
			.contains("'적금·CMA 80%'처럼 이 시나리오의 유형 이름을 나열한 바로 뒤")
			.contains("서버가 계산 결과 문장으로 따로 보여 줘요")
			.contains("'매달 넣을 돈과 목표에 닿는 비율은 계산 결과에서 확인해요'")
			.contains("'수익을 보장받지 못해요'")
			.doesNotContain("23%처럼 정수로 줄이지 않아요")
			.contains("monthlyBudget은 사용자가 매달 넣을 수 있다고 한 돈")
			.contains("가능액 안에 든다거나 넘는다고 단정하지 않아요")
			.contains("목표 금액, 월 납입 가능액,")
			.contains("정확히 세 개")
			// v10(#402): 유형마다 넣은 이유·근거·전망 칸, 칸별 분량, 비중 0인 유형은 빈 칸, 전망에는 숫자 없음
			.contains("typeRoles: 유형 다섯 개(SAVINGS·CMA·KR_INDEX_ETF·US_INDEX_ETF·KOSPI_TOP5)마다 reason·basis·outlook 세 칸")
			.contains("비중이 0인 유형은 세 칸을 모두 빈 문자열(\"\")로 둬요")
			.contains("reason(넣은 이유): ").contains("basis(근거): 두 문장").contains("outlook(전망): 두 문장")
			.contains("'다만 ~하면 줄어들 수 있어요'처럼 그 전망이 어긋날 때의 위험")
			.contains("전망 문장에는 숫자를 쓰지 않아요")
			// 화면이 문단 첫머리의 유형 이름으로 소제목을 붙인다
			.contains("'적금은', 'CMA는', '국내 지수 ETF는', '미국 지수 ETF는', '코스피 대형주는'처럼 유형 이름으로 시작해요")
			// 유형별 모범 예시(다섯 유형 모두, 숫자 자리는 〈 〉)
			.contains("아래는 유형별 모범 예시예요")
			.contains("reason: 적금은 ").contains("reason: CMA는 ").contains("reason: 국내 지수 ETF는 ").contains("reason: 미국 지수 ETF는 ")
			.contains("reason: 코스피 대형주는 ")
			.contains("국내 지수 ETF는 〈비중〉%로, 지난 60개월 월 평균 수익률은 〈월 평균〉%이고 월 변동폭은 〈월 변동폭〉%예요.")
			.doesNotContain("roles: ")
			.doesNotContain("앞으로 오르거나 내릴지 예측하지 않아요")
			.contains("alternatives")
			.contains("금리가 정해져 있어요")
			.contains("'원금이 보장돼요', '보장된 금리', '확실한 수익'이라고 쓰지 않아요")
			.contains("reason: ").contains("typeRoles: ").contains("comparison: ").contains("fit: ")
			.contains("'나머지 70%', '둘을 합쳐 30%'처럼 합쳤다는 말 바로 뒤나,")
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
	void 스키마는_해설_칸과_유형별_칸을_필수로_받는다() {
		var scenarios = (java.util.Map<String, Object>) ((java.util.Map<String, Object>) RestGoalScenarioAiClient.schema().get("properties")).get("scenarios");
		var scenario = (java.util.Map<String, Object>) scenarios.get("items");
		var required = (java.util.List<String>) scenario.get("required");
		assertThat(required).containsExactlyInAnyOrder("id", "title", "summary", "reason", "typeRoles", "comparison", "fit", "mix");
		var props = (java.util.Map<String, Object>) scenario.get("properties");
		assertThat(props).containsOnlyKeys(required);
		// typeRoles: 유형 다섯 개 모두 필수, 유형마다 reason·basis·outlook 필수(v10, #402)
		var typeRoles = (java.util.Map<String, Object>) props.get("typeRoles");
		assertThat((java.util.List<String>) typeRoles.get("required")).containsExactly("SAVINGS", "CMA", "KR_INDEX_ETF", "US_INDEX_ETF", "KOSPI_TOP5");
		assertThat(typeRoles).containsEntry("additionalProperties", false);
		var savings = (java.util.Map<String, Object>) ((java.util.Map<String, Object>) typeRoles.get("properties")).get("SAVINGS");
		assertThat((java.util.List<String>) savings.get("required")).containsExactly("reason", "basis", "outlook");
		assertThat(savings).containsEntry("additionalProperties", false);
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
	@ExtendWith(OutputCaptureExtension.class)
	void 성공한_호출은_버전_토큰_응답_시간만_로그에_남긴다(CapturedOutput output) {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withSuccess("""
				{"choices":[{"finish_reason":"stop","message":{"content":"{\\"scenarios\\":[{\\"fit\\":\\"secret-text\\"}]}","refusal":null}}],
				 "usage":{"prompt_tokens":321,"completion_tokens":4567}}
				""", MediaType.APPLICATION_JSON));
		client.propose("{\"targetAmount\":15000000,\"months\":12,\"monthlyBudget\":500000}");
		assertThat(output).containsPattern("goal scenario AI call: version=goal-scenario-v10 promptTokens=321 completionTokens=4567 elapsedMs=\\d+")
			.doesNotContain("15000000").doesNotContain("500000").doesNotContain("secret-text").doesNotContain("fake-test-key");
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 실패한_호출은_호출_로그를_남기지_않는다(CapturedOutput output) {
		server.expect(requestTo("https://example.com/v1/chat/completions")).andRespond(withServerError().body("secret-body"));
		assertThatThrownBy(() -> client.propose("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
		assertThat(output).doesNotContain("goal scenario AI call").doesNotContain("secret-body");
	}

	@Test
	void 키가_없으면_부르지_않는다() {
		var none = new RestGoalScenarioAiClient(RestClient.builder(), new OpenAiProperties("", "https://example.com/v1", "gpt-4o-mini"));
		assertThat(none.enabled()).isFalse();
		assertThatThrownBy(() -> none.propose("{}")).isInstanceOf(GoalScenarioAiClient.Failed.class);
	}
}
