package com.flexable.web.ingest;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpHeaders;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.kiwoom.KiwoomPriceSource;
import com.flexable.web.ingest.kiwoom.KiwoomTokenClient;

class KiwoomPriceSourceTest {

	@Test
	void 토큰을_받고_next_key로_이어_받는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		RestClient http = builder.build();
		Clock clock = Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"), ZoneOffset.UTC);
		KiwoomPriceSource p = new KiwoomPriceSource(http, "https://kw.test",
				new KiwoomTokenClient(http, "https://kw.test", "app", "secret", clock), Duration.ZERO);

		server.expect(requestTo("https://kw.test/oauth2/token")).andExpect(method(HttpMethod.POST))
			.andRespond(withSuccess("{\"token\":\"T1\",\"expires_dt\":\"20261021090000\",\"return_code\":0}", MediaType.APPLICATION_JSON));
		HttpHeaders more = new HttpHeaders();
		more.set("cont-yn", "Y");
		more.set("next-key", "K2");
		server.expect(requestTo("https://kw.test/api/dostk/chart"))
			.andExpect(header("api-id", "ka10081"))
			.andExpect(header("Authorization", "Bearer T1"))
			.andRespond(withSuccess("{\"return_code\":0,\"stk_dt_pole_chart_qry\":["
					+ "{\"dt\":\"20261016\",\"cur_prc\":\"+215500\"},{\"dt\":\"20261015\",\"cur_prc\":\"-210000\"}]}",
					MediaType.APPLICATION_JSON).headers(more));
		server.expect(requestTo("https://kw.test/api/dostk/chart"))
			.andExpect(header("next-key", "K2"))
			.andRespond(withSuccess("{\"return_code\":0,\"stk_dt_pole_chart_qry\":["
					+ "{\"dt\":\"20261014\",\"cur_prc\":\"232000\"},{\"dt\":\"20261010\",\"cur_prc\":\"1\"}]}",
					MediaType.APPLICATION_JSON));

		List<DailyBar> got = p.dailyBars("005930", LocalDate.parse("2026-10-13"), LocalDate.parse("2026-10-16"))
			.stream().sorted(Comparator.comparing(DailyBar::date)).toList();
		server.verify();
		assertEquals(List.of(
				new DailyBar(LocalDate.parse("2026-10-14"), 232000, null),
				new DailyBar(LocalDate.parse("2026-10-15"), 210000, null),
				new DailyBar(LocalDate.parse("2026-10-16"), 215500, null)), got);
	}
}
