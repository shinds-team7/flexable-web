package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneOffset;
import java.util.Comparator;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.kiwoom.KiwoomIndexSource;
import com.flexable.web.ingest.kiwoom.KiwoomTokenClient;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

class KiwoomIndexSourceTest {

	@Test
	void 업종일봉의_지수x100_정수를_소수_2자리로_바꾸고_기간_밖은_뺀다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		RestClient http = builder.build();
		Clock clock = Clock.fixed(Instant.parse("2026-10-23T00:00:00Z"), ZoneOffset.UTC);
		KiwoomIndexSource s = new KiwoomIndexSource(http, "https://kw.test", new KiwoomTokenClient(http, "https://kw.test", "app", "secret", clock));

		server.expect(requestTo("https://kw.test/oauth2/token"))
			.andRespond(withSuccess("{\"token\":\"T1\",\"expires_dt\":\"20261024090000\",\"return_code\":0}", MediaType.APPLICATION_JSON));
		server.expect(requestTo("https://kw.test/api/dostk/chart"))
			.andExpect(header("api-id", "ka20006"))
			.andExpect(content().json("{\"inds_cd\":\"101\",\"base_dt\":\"20261023\"}"))
			.andRespond(withSuccess("{\"return_code\":0,\"inds_dt_pole_qry\":["
					+ "{\"dt\":\"20261023\",\"cur_prc\":\"+86125\"},{\"dt\":\"20261022\",\"cur_prc\":\"-85000\"},"
					+ "{\"dt\":\"20261001\",\"cur_prc\":\"84000\"}]}", MediaType.APPLICATION_JSON));

		List<IndexValue> got = s.daily(IndexKey.KOSDAQ, LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 23)).stream()
			.sorted(Comparator.comparing(IndexValue::date)).toList();
		server.verify();
		assertThat(got).containsExactly(new IndexValue(LocalDate.of(2026, 10, 22), new BigDecimal("850.00")),
				new IndexValue(LocalDate.of(2026, 10, 23), new BigDecimal("861.25")));
		assertThat(s.keys()).containsExactlyInAnyOrder(IndexKey.KOSPI, IndexKey.KOSDAQ);
		assertThatThrownBy(() -> s.daily(IndexKey.GOLD, LocalDate.of(2026, 10, 20), LocalDate.of(2026, 10, 23)))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
