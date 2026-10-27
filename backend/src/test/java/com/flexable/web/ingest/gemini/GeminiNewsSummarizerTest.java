package com.flexable.web.ingest.gemini;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;

import tools.jackson.databind.json.JsonMapper;

/** Gemini 묶음 요약: 요청 형식, 응답 읽기, 요약 검사(원문에 없는 숫자·길이·금지어), 키 가리기. 원문은 가상 정책이다. */
class GeminiNewsSummarizerTest {

	private static final String URL = "https://gemini.test/v1beta/models/test-model:generateContent";
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static final SummaryTarget RENT = new SummaryTarget(1, "청년 월세 지원(예시)",
			"{\"plcyNo\":\"1\",\"plcyExplnCn\":\"무주택 청년의 주거비 부담을 덜어요\",\"plcySprtCn\":\"월 최대 200,000원, 12개월 지원\"}", "h1");
	private static final SummaryTarget SUIT = new SummaryTarget(2, "면접 정장 대여(예시)",
			"{\"plcyNo\":\"2\",\"plcySprtCn\":\"면접 정장을 무료로 빌려줘요\"}", "h2");

	private static String reply(String rowsJson) throws Exception {
		return JSON.writeValueAsString(java.util.Map.of("candidates",
				List.of(java.util.Map.of("content", java.util.Map.of("parts", List.of(java.util.Map.of("text", rowsJson)))))));
	}

	@Test
	void 묶어서_보내고_검사를_통과한_요약만_넣는다() throws Exception {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		String rows = """
				[{"id":1,"summary":"무주택 청년에게 월세를 월 최대 200,000원씩 12개월 지원해요."},
				 {"id":2,"summary":"면접 정장을 무료로 빌려주고 50,000원을 더 줘요."},
				 {"id":99,"summary":"없는 카드"}]
				""";
		server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", "KEY"))
			.andRespond(withSuccess(reply(rows), MediaType.APPLICATION_JSON));
		List<SummaryResult> out = new GeminiNewsSummarizer(builder.build(), "https://gemini.test", "KEY", "test-model").summarize(List.of(RENT, SUIT));
		server.verify();
		assertThat(out).containsExactly(
				new SummaryResult(1, "h1", "무주택 청년에게 월세를 월 최대 200,000원씩 12개월 지원해요."),
				// 원문에 없는 금액(50,000원)을 넣은 요약은 버린다
				new SummaryResult(2, "h2", null));
	}

	@Test
	void 요약_검사() {
		String src = "청년 월세 지원 / 월 최대 200,000원, 12개월 지원";
		// 같은 금액이면 단위를 바꿔 써도 된다(20만 = 200,000). 원문에 없는 금액은 버린다
		assertThat(GeminiNewsSummarizer.check("월 최대 20만 원을 12개월 지원해요.", src)).isEqualTo("월 최대 20만 원을 12개월 지원해요.");
		assertThat(GeminiNewsSummarizer.check("월 최대 30만 원을 12개월 지원해요.", src)).isNull();
		assertThat(GeminiNewsSummarizer.check("월 최대 20만 원을 24개월 지원해요.", src)).isNull();
		assertThat(GeminiNewsSummarizer.check("최대 20만 원이에요.", "청년 지원 / 월 최대 20만원")).isNotNull();
		assertThat(GeminiNewsSummarizer.check("월 최대 200,000원을 12개월 지원해요.", src)).isEqualTo("월 최대 200,000원을 12개월 지원해요.");
		// 요약의 "12만"은 120000으로만 본다. 원문의 숫자를 서로 바꿔 끼운 요약은 버린다
		String unitSrc = "청년 지원 / 월 최대 20만 원, 12개월 지원";
		assertThat(GeminiNewsSummarizer.check("월 최대 12만 원을 20개월 지원해요.", unitSrc)).isNull();
		assertThat(GeminiNewsSummarizer.check("월 최대 20만 원을 12개월 지원해요.", unitSrc)).isNotNull();
		assertThat(GeminiNewsSummarizer.check("  월세를  지원해요.  ", src)).isEqualTo("월세를 지원해요.");
		assertThat(GeminiNewsSummarizer.check("이 정책을 추천해요.", src)).isNull();
		assertThat(GeminiNewsSummarizer.check("가".repeat(161), src)).isNull();
		assertThat(GeminiNewsSummarizer.check("하나예요. 둘이에요. 셋이에요. 넷이에요.", src)).isNull();
		assertThat(GeminiNewsSummarizer.check("하나예요. 둘이에요. 셋이에요.", src)).isNotNull();
		assertThat(GeminiNewsSummarizer.check("", src)).isNull();
		assertThat(GeminiNewsSummarizer.check(null, src)).isNull();
	}

	@Test
	void 오류에는_키를_남기지_않고_키가_없으면_쓰지_않는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("quota KEY exceeded").contentType(MediaType.TEXT_PLAIN));
		assertThatThrownBy(() -> new GeminiNewsSummarizer(builder.build(), "https://gemini.test", "KEY", "test-model").summarize(List.of(RENT)))
			.hasMessageContaining("Gemini 호출 실패")
			.hasMessageNotContaining("KEY");
		assertThat(new GeminiNewsSummarizer(RestClient.create(), "https://gemini.test", "", "m").enabled()).isFalse();
		assertThat(new GeminiNewsSummarizer(RestClient.create(), "https://gemini.test", null, "m").enabled()).isFalse();
	}

}
