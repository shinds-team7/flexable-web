package com.flexable.web.errorlog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.mock.web.MockHttpServletRequest;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.flexable.web.errorlog.ErrorReport.Kind;
import com.flexable.web.errorlog.ErrorReport.Source;
import com.jayway.jsonpath.JsonPath;

/** 오류 기록(docs/decisions/2026-11-08-error-events.md): 가리기·묶기·한도·보관·탈퇴 삭제·서버 500 기록. */
@SpringBootTest
@AutoConfigureMockMvc
class ErrorEventTest {

	private static final String PASSWORD = "password1";
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcTemplate jdbc;
	@Autowired
	ErrorEventService service;
	@Autowired
	ErrorRecorder recorder;
	@Autowired
	Clock clock;

	@BeforeEach
	void clean() {
		jdbc.update("DELETE FROM error_events");
	}

	private static String body(String kind, String message, String extra) {
		return "{\"kind\":\"" + kind + "\",\"message\":\"" + message + "\"" + (extra.isEmpty() ? "" : "," + extra) + "}";
	}

	private ResultActions send(String json, String ip, String token) throws Exception {
		var req = post("/api/v1/client-errors").contentType(MediaType.APPLICATION_JSON).content(json)
			.with(r -> {
				r.setRemoteAddr(ip);
				return r;
			});
		if (token != null) {
			req = req.header("Authorization", "Bearer " + token);
		}
		return mvc.perform(req);
	}

	private int count() {
		return jdbc.queryForObject("SELECT COUNT(*) FROM error_events", Integer.class);
	}

	private String signup() throws Exception {
		String email = "err" + System.nanoTime() + "@example.com";
		String res = mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"agreeTerms\":true}"))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		return JsonPath.read(res, "$.accessToken");
	}

	@Test
	void masksNumbersAndEmailsAndNormalizesPath() {
		assertThat(ErrorEventService.mask("금액 1,234,567원 a@b.com 7 12")).isEqualTo("금액 #원 ***@*** 7 12");
		assertThat(ErrorEventService.mask("전화 010-1234-5678")).isEqualTo("전화 #-#-#");
		assertThat(ErrorEventService.normalizePath("/api/v1/savings/products/123/items?from=2026-01-01&q=홍길동"))
			.isEqualTo("/api/v1/savings/products/{id}/items");
		assertThat(ErrorEventService.normalizePath("/api/v1/me/goal/scenarios/0f8fad5b-d9cb-469f-a165-70867728950e"))
			.isEqualTo("/api/v1/me/goal/scenarios/{id}");
		assertThat(ErrorEventService.normalizePath("  ")).isNull();
	}

	@Test
	void fingerprintIgnoresUserAndVersionButNotMessageOrStack() {
		ErrorReport a = ErrorEventService.clean(new ErrorReport(Source.WEB, Kind.API, 1L, "1.0", "web", "/home", "GET",
				"/api/v1/x/12345", 500, "E", "실패 99999원", "s1\ns2\ns3\ns4"));
		ErrorReport b = ErrorEventService.clean(new ErrorReport(Source.WEB, Kind.API, 2L, "2.0", "web", "/other", "GET",
				"/api/v1/x/67890", 500, "E", "실패 11111원", "s1\ns2\ns3\nother"));
		ErrorReport c = ErrorEventService.clean(new ErrorReport(Source.WEB, Kind.API, 1L, "1.0", "web", "/home", "GET",
				"/api/v1/x/12345", 500, "E", "다른 실패", "s1\ns2\ns3"));
		assertThat(ErrorEventService.fingerprint(a)).isEqualTo(ErrorEventService.fingerprint(b)).hasSize(64)
			.isNotEqualTo(ErrorEventService.fingerprint(c));
	}

	@Test
	void sameErrorOnSameDayIsOneRowWithOccurrences() throws Exception {
		String json = body("API", "응답 오류 12345원", "\"status\":500,\"path\":\"/api/v1/a/99?x=1\",\"method\":\"GET\",\"code\":\"UNKNOWN\",\"appVersion\":\"1.0.0\"");
		send(json, "10.0.0.1", null).andExpect(status().isNoContent());
		send(json, "10.0.0.1", null).andExpect(status().isNoContent());
		send(json, "10.0.0.2", null).andExpect(status().isNoContent());
		assertThat(count()).isEqualTo(1);
		Map<String, Object> row = jdbc.queryForMap("SELECT * FROM error_events");
		assertThat(((Number) row.get("OCCURRENCES")).intValue()).isEqualTo(3);
		assertThat(row.get("SOURCE")).isEqualTo("WEB");
		assertThat(row.get("KIND")).isEqualTo("API");
		assertThat(row.get("PLATFORM")).isEqualTo("web");
		assertThat(row.get("PATH")).isEqualTo("/api/v1/a/{id}");
		assertThat(row.get("MESSAGE")).isEqualTo("응답 오류 #원");
		assertThat(row.get("USER_ID")).isNull();
		assertThat(row.get("EVENT_DAY").toString()).isEqualTo(LocalDate.now(clock.withZone(SEOUL)).toString());
	}

	@Test
	void validTokenAddsUserIdAndInvalidInputIs400() throws Exception {
		String token = signup();
		send(body("JS", "boom", ""), "10.0.1.1", token).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT user_id FROM error_events", Long.class)).isNotNull();
		send("{\"kind\":\"SERVER\",\"message\":\"x\"}", "10.0.1.1", null).andExpect(status().isBadRequest());
		send("{\"kind\":\"JS\",\"message\":\"\"}", "10.0.1.1", null).andExpect(status().isBadRequest());
		send(body("JS", "x", "\"method\":\"TRACE\""), "10.0.1.1", null).andExpect(status().isBadRequest());
		send(body("JS", "x", "\"extra\":1"), "10.0.1.1", null).andExpect(status().isNoContent());
		send(body("JS", "x", ""), "10.0.1.1", "not-a-token").andExpect(status().isUnauthorized());
	}

	@Test
	void eachSenderIsLimitedTo30PerWindowButStill204() throws Exception {
		for (int i = 0; i < 35; i++) {
			send(body("JS", "오류 번호 " + (char) ('a' + i % 26) + (char) ('A' + i / 26), ""), "10.0.2.9", null)
				.andExpect(status().isNoContent());
		}
		assertThat(count()).isEqualTo(30);
		// 다른 보낸 사람은 따로 센다
		send(body("JS", "다른 사람 오류", ""), "10.0.2.10", null).andExpect(status().isNoContent());
		assertThat(count()).isEqualTo(31);
	}

	@Test
	void newRowsPerDayAreCappedButExistingRowsStillCount() {
		for (int i = 0; i < ErrorEventService.NEW_PER_DAY + 5; i++) {
			service.record(new ErrorReport(Source.SERVER, Kind.SERVER, null, null, null, null, null, null, 500, null,
					"m" + (char) ('a' + i % 26) + (char) ('a' + i / 26 % 26) + (char) ('a' + i / 676), null));
		}
		assertThat(count()).isEqualTo(ErrorEventService.NEW_PER_DAY);
		service.record(new ErrorReport(Source.SERVER, Kind.SERVER, null, null, null, null, null, null, 500, null, "maaa", null));
		assertThat(jdbc.queryForObject("SELECT occurrences FROM error_events WHERE message = 'maaa'", Integer.class))
			.isEqualTo(2);
	}

	@Test
	void deletesRowsOlderThan30DaysAndKeepsRecentOnes() {
		service.record(new ErrorReport(Source.SERVER, Kind.SERVER, null, null, null, null, null, null, 500, null, "new", null));
		jdbc.update("INSERT INTO error_events (event_day, fingerprint, source, kind, message, occurrences, first_at, last_at)"
				+ " VALUES (?, 'old', 'WEB', 'JS', 'old', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
				LocalDate.now(SEOUL).minusDays(31));
		jdbc.update("INSERT INTO error_events (event_day, fingerprint, source, kind, message, occurrences, first_at, last_at)"
				+ " VALUES (?, 'edge', 'WEB', 'JS', 'edge', 1, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)",
				LocalDate.now(SEOUL).minusDays(30));
		assertThat(service.deleteExpired()).isEqualTo(1);
		assertThat(count()).isEqualTo(2);
	}

	@Test
	void withdrawalDeletesTheMembersRows() throws Exception {
		String token = signup();
		send(body("JS", "회원 오류", ""), "10.0.3.1", token).andExpect(status().isNoContent());
		send(body("JS", "비회원 오류", ""), "10.0.3.2", null).andExpect(status().isNoContent());
		assertThat(count()).isEqualTo(2);
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"" + PASSWORD + "\"}"))
			.andExpect(status().isNoContent());
		assertThat(count()).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT message FROM error_events", String.class)).isEqualTo("비회원 오류");
	}

	@Test
	void serverErrorIsRecordedWithoutBodyOrQuery() {
		MockHttpServletRequest request = new MockHttpServletRequest("POST", "/api/v1/me/goal/42");
		request.setQueryString("secret=1");
		recorder.serverError(request, new IllegalStateException("깨짐 user@example.com 123456"));
		Map<String, Object> row = jdbc.queryForMap("SELECT * FROM error_events");
		assertThat(row.get("SOURCE")).isEqualTo("SERVER");
		assertThat(row.get("KIND")).isEqualTo("SERVER");
		assertThat(((Number) row.get("STATUS")).intValue()).isEqualTo(500);
		assertThat(row.get("CODE")).isEqualTo("INTERNAL_ERROR");
		assertThat(row.get("METHOD")).isEqualTo("POST");
		assertThat(row.get("PATH")).isEqualTo("/api/v1/me/goal/{id}");
		assertThat(row.get("MESSAGE")).isEqualTo("IllegalStateException: 깨짐 ***@*** #");
		assertThat((String) row.get("STACK")).startsWith("java.lang.IllegalStateException").doesNotContain("secret");
	}
}
