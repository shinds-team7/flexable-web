package com.flexable.web.ingest.gemini;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.mock.http.client.MockClientHttpRequest;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.PlacementSummaryWriter.Input;
import com.flexable.web.ingest.PlacementSummaryWriter.Result;

import tools.jackson.databind.json.JsonMapper;

/**
 * 배치고사 공시 AI 요약: 보내는 값(유형·제목·본문 글만, 회사 이름·접수번호·막을 이름은 보내지 않음), 응답 읽기, 검사 결과. 공시는 가상 값이다.
 */
class GeminiPlacementSummaryWriterTest {

	private static final String URL = "https://gemini.test/v1beta/models/test-model:generateContent";
	private static final JsonMapper JSON = JsonMapper.builder().build();

	private static String reply(String rowsJson) throws Exception {
		return JSON.writeValueAsString(Map.of("candidates", List.of(Map.of("content", Map.of("parts", List.of(Map.of("text", rowsJson)))))));
	}

	@Test
	void 본문_글만_보내고_검사를_통과한_요약만_돌려준다() throws Exception {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		List<Map<?, ?>> sent = new ArrayList<>();
		String[] instruction = new String[1];
		String rows = """
				[{"id":1,"summary":"이 회사가 다른 회사와 설비 공급 계약을 맺었다고 알렸어요. 계약 금액은 100억~500억 원 규모로 최근 매출액의 8.5%에 해당해요."},
				 {"id":2,"summary":"한빛전자가 결산 배당을 결정했어요. 시가배당률은 2.1%예요."},
				 {"id":99,"summary":"없는 공시"}]
				""";
		server.expect(requestTo(URL)).andExpect(method(HttpMethod.POST)).andExpect(header("x-goog-api-key", "KEY"))
			.andExpect(req -> {
				Map<?, ?> body = JSON.readValue(((MockClientHttpRequest) req).getBodyAsString(), Map.class);
				instruction[0] = (String) ((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("systemInstruction")).get("parts")).getFirst()).get("text");
				String user = (String) ((Map<?, ?>) ((List<?>) ((Map<?, ?>) ((List<?>) body.get("contents")).getFirst()).get("parts")).getFirst()).get("text");
				for (Object o : JSON.readValue(user, List.class)) {
					sent.add((Map<?, ?>) o);
				}
			})
			.andRespond(withSuccess(reply(rows), MediaType.APPLICATION_JSON));
		List<Result> out = new GeminiPlacementSummaryWriter(builder.build(), "https://gemini.test", "KEY", "test-model").write(List.of(
				new Input("20250101000001", "공급 계약", "단일판매ㆍ공급계약체결", "계약금액 | 12,345,678,900\n최근 매출액 대비(%) | 8.57", Set.of("한빛전자", "누리소재")),
				new Input("20250101000002", "배당", "현금ㆍ현물배당결정", "시가배당율(%) | 2.1", Set.of("한빛전자"))));
		server.verify();

		// 유형·제목·본문 글만 보낸다. 접수번호·막을 이름(회사 이름)은 보내지 않는다
		assertThat(sent).hasSize(2);
		sent.forEach(m -> assertThat(m.keySet().stream().map(String::valueOf).toList()).containsExactlyInAnyOrder("id", "type", "title", "text"));
		assertThat(JSON.writeValueAsString(sent)).doesNotContain("20250101000001").doesNotContain("한빛전자").doesNotContain("누리소재");
		// 지시문에 규모 구간 이름을 그대로 넣는다(서식 문자 %가 남지 않는다)
		assertThat(instruction[0]).contains("10억 원 미만, 10억~50억 원").contains("기존 대비 %로만").doesNotContain("%%").doesNotContain("%s");
		assertThat(out).containsExactly(
				new Result("20250101000001", "이 회사가 다른 회사와 설비 공급 계약을 맺었다고 알렸어요. 계약 금액은 100억~500억 원 규모로 최근 매출액의 8.5%에 해당해요.", null),
				// 회사 이름이 든 요약은 버리고, 다시 쓰기에 보낼 글과 까닭을 함께 돌려준다(저장·로그에는 남기지 않는다)
				new Result("20250101000002", null, "NAME", "이름('한빛전자')이 들어 있어요. 회사·상대방·사람 이름 없이 이 회사·상대 회사처럼 쓰세요.",
						"한빛전자가 결산 배당을 결정했어요. 시가배당률은 2.1%예요."));
	}

	@Test
	void 다시_쓰기는_앞서_쓴_글과_까닭을_함께_보낸다() throws Exception {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		List<Map<?, ?>> sent = new ArrayList<>();
		String[] instruction = new String[1];
		server.expect(requestTo(URL)).andExpect(req -> {
			Map<?, ?> body = JSON.readValue(((MockClientHttpRequest) req).getBodyAsString(), Map.class);
			instruction[0] = (String) ((Map<?, ?>) ((List<?>) ((Map<?, ?>) body.get("systemInstruction")).get("parts")).getFirst()).get("text");
			String user = (String) ((Map<?, ?>) ((List<?>) ((Map<?, ?>) ((List<?>) body.get("contents")).getFirst()).get("parts")).getFirst()).get("text");
			for (Object o : JSON.readValue(user, List.class)) {
				sent.add((Map<?, ?>) o);
			}
		}).andRespond(withSuccess(reply("[{\"id\":1,\"summary\":\"이 회사가 결산 배당을 결정했어요. 시가배당률은 2.1%예요.\"}]"), MediaType.APPLICATION_JSON));
		Input in = new Input("20250101000002", "배당", "현금ㆍ현물배당결정", "시가배당율(%) | 2.1", Set.of("한빛전자"));
		List<Result> out = new GeminiPlacementSummaryWriter(builder.build(), "https://gemini.test", "KEY", "test-model")
			.rewrite(List.of(new com.flexable.web.ingest.PlacementSummaryWriter.Retry(in, "한빛전자가 배당을 결정했어요.", "이름이 들어 있어요.")));
		server.verify();

		assertThat(instruction[0]).contains("다시 쓰기");
		assertThat(sent.getFirst().get("draft")).isEqualTo("한빛전자가 배당을 결정했어요.");
		assertThat(sent.getFirst().get("problem")).isEqualTo("이름이 들어 있어요.");
		assertThat(out).containsExactly(new Result("20250101000002", "이 회사가 결산 배당을 결정했어요. 시가배당률은 2.1%예요.", null));
	}
}
