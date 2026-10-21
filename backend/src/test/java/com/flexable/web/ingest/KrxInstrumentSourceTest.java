package com.flexable.web.ingest;

import com.flexable.web.market.Board;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.HttpClientErrorException;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.krx.KrxInstrumentSource;

class KrxInstrumentSourceTest {

	// 2026-10-20(화) 09:00 KST → 어제(10-19)부터 찾는다
	private final Clock clock = Clock.fixed(Instant.parse("2026-10-20T00:00:00Z"), ZoneOffset.UTC);

	@Test
	void 비어_있는_날은_앞_날짜로_다시_찾고_시가총액을_읽는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KrxInstrumentSource p = new KrxInstrumentSource(builder.build(), "https://krx.test", "KEY", clock, ZoneId.of("Asia/Seoul"));
		server.expect(requestTo("https://krx.test/sto/stk_bydd_trd?basDd=20261019")).andExpect(header("AUTH_KEY", "KEY"))
			.andRespond(withSuccess("{\"OutBlock_1\":[]}", MediaType.APPLICATION_JSON));
		server.expect(requestTo("https://krx.test/sto/stk_bydd_trd?basDd=20261018"))
			.andRespond(withSuccess("{\"OutBlock_1\":[{\"ISU_CD\":\"005930\",\"ISU_NM\":\"삼성전자\",\"MKT_NM\":\"KOSPI\",\"MKTCAP\":\"1274488736544000\"},"
					+ "{\"ISU_CD\":\"000660\",\"ISU_NM\":\"SK하이닉스\",\"MKT_NM\":\"KOSPI\",\"MKTCAP\":\"-\"}]}", MediaType.APPLICATION_JSON));

		InstrumentListing l = p.listing(Board.KOSPI);
		server.verify();
		assertEquals(List.of(
				new InstrumentInfo("005930", "삼성전자", "KOSPI", "STOCK", 1274488736544000L),
				new InstrumentInfo("000660", "SK하이닉스", "KOSPI", "STOCK", null)), l.items());
		// 같은 날 두 번째는 캐시(요청 없음)
		assertEquals(2, p.listing(Board.KOSPI).items().size());
	}

	@Test
	void 승인_안_된_API는_예외() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KrxInstrumentSource p = new KrxInstrumentSource(builder.build(), "https://krx.test", "KEY", clock, ZoneId.of("Asia/Seoul"));
		server.expect(requestTo("https://krx.test/etp/etf_bydd_trd?basDd=20261019"))
			.andRespond(withStatus(HttpStatus.UNAUTHORIZED).body("{\"respMsg\":\"Unauthorized API Call\",\"respCode\":\"401\"}"));
		assertThrows(HttpClientErrorException.class, () -> p.listing(Board.ETF));
	}
}
