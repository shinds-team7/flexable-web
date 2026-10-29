package com.flexable.web.ingest.gemini;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.EventDtos.OverviewInput;
import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;

import tools.jackson.databind.json.JsonMapper;

/** 사건 AI 개요: 보내는 값(허용 자료만), 응답 읽기, 검사(입력에 없는 숫자·금지 표현·길이), 키 가리기. 사건은 가상 값이다. */
class GeminiEventOverviewWriterTest {

	private static final String URL = "https://gemini.test/v1beta/models/test-model:generateContent";
	private static final JsonMapper JSON = JsonMapper.builder().build();
	/** 개요 입력으로 허용한 칸(decisions/2026-10-29-event-ai-summary). 네이버 뉴스 기사 칸은 없다 */
	private static final Set<String> ALLOWED = Set.of("id", "scope", "name", "period", "windowDays", "direction", "returnRate",
			"marketReturn", "volumeRatio", "disclosures");

	private static final OverviewInput STOCK = new OverviewInput(1, "STOCK", "가나전자", "2026년 10월 12일", 1, "RISE", "+4.2%", "+1.0%",
			"3.1배", List.of("단일판매ㆍ공급계약체결", "공개매수신고서"));
	private static final OverviewInput MARKET = new OverviewInput(2, "MARKET", "시장 전체(코스피200 추종 ETF)",
			"2026년 3월 3일~2026년 3월 9일", 5, "FALL", "−7.5%", null, null, List.of());

	private static String reply(String rowsJson) throws Exception {
		return JSON.writeValueAsString(Map.of("candidates", List.of(Map.of("content", Map.of("parts", List.of(Map.of("text", rowsJson)))))));
	}

	@Test
	void 허용한_자료만_보내고_검사를_통과한_개요만_넣는다() throws Exception {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		List<Map<?, ?>> sent = new ArrayList<>();
		String rows = """
				[{"id":1,"overview":"가나전자 주가는 10월 12일 하루 +4.2% 올랐어요. 이 기간에 단일판매ㆍ공급계약체결 공시가 있었어요."},
				 {"id":2,"overview":"시장 전체는 금리 우려 때문에 5거래일 동안 −7.5% 내렸어요."},
				 {"id":99,"overview":"없는 사건"}]
				""";
		server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", "KEY"))
			.andExpect(req -> {
				Map<?, ?> body = JSON.readValue(((MockClientHttpRequest) req).getBodyAsString(), Map.class);
				String user = (String) ((Map<?, ?>) ((List<?>) ((Map<?, ?>) ((List<?>) body.get("contents")).getFirst()).get("parts")).getFirst())
					.get("text");
				for (Object o : JSON.readValue(user, List.class)) {
					sent.add((Map<?, ?>) o);
				}
			})
			.andRespond(withSuccess(reply(rows), MediaType.APPLICATION_JSON));
		List<OverviewResult> out = new GeminiEventOverviewWriter(builder.build(), "https://gemini.test", "KEY", "test-model")
			.write(List.of(new OverviewTarget(STOCK, "h1"), new OverviewTarget(MARKET, "h2")));
		server.verify();

		assertThat(sent).hasSize(2);
		sent.forEach(m -> assertThat(ALLOWED).containsAll(m.keySet().stream().map(String::valueOf).toList()));
		assertThat(sent.getFirst().get("disclosures")).isEqualTo(List.of("단일판매ㆍ공급계약체결", "공개매수신고서"));
		// 시장 사건은 시장 대비·거래량·공시가 비어 있어 칸을 보내지 않는다
		assertThat(sent.get(1).keySet().stream().map(String::valueOf).toList()).doesNotContain("marketReturn", "volumeRatio", "disclosures");
		assertThat(out).containsExactly(
				new OverviewResult(1, "h1", "가나전자 주가는 10월 12일 하루 +4.2% 올랐어요. 이 기간에 단일판매ㆍ공급계약체결 공시가 있었어요.", "test-model", false),
				// 원인을 단정한("때문에") 개요는 버리고 지문만 남긴다
				new OverviewResult(2, "h2", null, "test-model", false));
	}

	@Test
	void 개요_검사() {
		assertThat(GeminiEventOverviewWriter.check("가나전자 주가는 10월 12일 하루 +4.2% 올랐어요.", STOCK)).isNotNull();
		assertThat(GeminiEventOverviewWriter.check("  가나전자 주가는  2026년 10월 12일 +4.2% 올랐어요.  ", STOCK))
			.isEqualTo("가나전자 주가는 2026년 10월 12일 +4.2% 올랐어요.");
		assertThat(GeminiEventOverviewWriter.check("거래량은 평소의 3.1배였고 시장 전체는 +1.0%였어요. 공시 2건이 있었어요.", STOCK)).isNotNull();
		// 입력에 없는 숫자(바꾼 등락률·지어낸 날짜·공시 수)는 버린다
		assertThat(GeminiEventOverviewWriter.check("가나전자 주가는 하루 +5.2% 올랐어요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("가나전자 주가는 10월 13일에 올랐어요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("이 기간에 공시 3건이 있었어요.", STOCK)).isNull();
		// 원인 단정·전망·권유 표현은 버린다. 공시 제목 안의 글자("공개매수")는 괜찮다
		assertThat(GeminiEventOverviewWriter.check("공급계약 체결 영향으로 +4.2% 올랐어요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("공급계약 덕분에 올랐어요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("앞으로도 오를 수 있어요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("지금 매수해 보세요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("이 종목을 추천해요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("이 기간에 공개매수신고서 공시가 있었어요.", STOCK)).isNotNull();
		// 길이·문장 수
		assertThat(GeminiEventOverviewWriter.check("가".repeat(161), STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("하나예요. 둘이에요. 셋이에요. 넷이에요.", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check("하나예요. 둘이에요. 셋이에요.", STOCK)).isNotNull();
		assertThat(GeminiEventOverviewWriter.check("", STOCK)).isNull();
		assertThat(GeminiEventOverviewWriter.check(null, STOCK)).isNull();
		// 시장 사건: 거래일 수·기간 숫자는 입력에 있다
		assertThat(GeminiEventOverviewWriter.check("시장 전체는 3월 3일부터 5거래일 동안 −7.5% 내렸어요.", MARKET)).isNotNull();
		assertThat(GeminiEventOverviewWriter.check("코스피200은 −7.5% 내렸어요.", MARKET)).isNotNull();
		assertThat(GeminiEventOverviewWriter.check("코스피는 2,400선까지 내렸어요.", MARKET)).isNull();
	}

	@Test
	void 오류에는_키를_남기지_않고_키가_없으면_쓰지_않는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(URL)).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).body("quota KEY exceeded").contentType(MediaType.TEXT_PLAIN));
		assertThatThrownBy(() -> new GeminiEventOverviewWriter(builder.build(), "https://gemini.test", "KEY", "test-model")
			.write(List.of(new OverviewTarget(STOCK, "h1"))))
			.hasMessageContaining("Gemini 호출 실패")
			.hasMessageNotContaining("KEY");
		assertThat(new GeminiEventOverviewWriter(RestClient.create(), "https://gemini.test", "", "m").enabled()).isFalse();
		assertThat(new GeminiEventOverviewWriter(RestClient.create(), "https://gemini.test", null, "m").enabled()).isFalse();
	}
}
