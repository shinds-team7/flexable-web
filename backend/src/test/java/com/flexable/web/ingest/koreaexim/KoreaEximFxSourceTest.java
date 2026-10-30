package com.flexable.web.ingest.koreaexim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.ExpectedCount.once;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/** 한국수출입은행 현재환율 API 응답 fixture(형식은 공식 안내의 AP01 JSON 배열). 외부 호출 없음. */
class KoreaEximFxSourceTest {

	private static final String BASE = "https://exim.test/exchangeJSON";
	private static final String KEY = "SECRET-KEY";
	/** 2026-10-27(화). 쉼표가 든 매매기준율, 100엔 단위, 위안은 CNH. KRW는 기준 통화라 결측("-")처럼 둔다. */
	private static final String TUE = """
			[{"result":1,"cur_unit":"USD","cur_nm":"미국 달러","deal_bas_r":"1,385.5","ttb":"1,371.64","tts":"1,399.35"},
			 {"result":1,"cur_unit":"JPY(100)","cur_nm":"일본 옌","deal_bas_r":"905.12"},
			 {"result":1,"cur_unit":"EUR","cur_nm":"유로","deal_bas_r":"1,501.3"},
			 {"result":1,"cur_unit":"CNH","cur_nm":"위안화","deal_bas_r":"190.21"},
			 {"result":1,"cur_unit":"KRW","cur_nm":"한국 원","deal_bas_r":"-"}]
			""";
	private static final String WED = """
			[{"result":1,"cur_unit":"USD","deal_bas_r":"1,390.1"},{"result":1,"cur_unit":"JPY(100)","deal_bas_r":"903.4"},
			 {"result":1,"cur_unit":"EUR","deal_bas_r":""},{"result":1,"cur_unit":"CNH","deal_bas_r":"190.55"}]
			""";

	private static String url(String date) {
		return BASE + "?authkey=" + KEY + "&searchdate=" + date + "&data=AP01";
	}

	@Test
	void 날짜마다_한_번_불러_통화별_매매기준율을_고르고_주말과_결측은_뺀다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KoreaEximFxSource s = new KoreaEximFxSource(builder.build(), BASE, KEY, Duration.ZERO);

		// 10-25(일)·10-26(월 휴일 가정: 빈 배열)·10-27(화)·10-28(수). 일요일은 부르지 않는다
		server.expect(once(), requestTo(url("20261026"))).andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
		server.expect(once(), requestTo(url("20261027"))).andRespond(withSuccess(TUE, MediaType.APPLICATION_JSON));
		server.expect(once(), requestTo(url("20261028"))).andRespond(withSuccess(WED, MediaType.TEXT_HTML)); // 형식 표시가 달라도 읽는다
		LocalDate from = LocalDate.of(2026, 10, 25);
		LocalDate to = LocalDate.of(2026, 10, 28);
		assertThat(s.daily(IndexKey.USDKRW, from, to)).containsExactly(new IndexValue(LocalDate.of(2026, 10, 27), new BigDecimal("1385.5")),
				new IndexValue(to, new BigDecimal("1390.1")));
		server.verify();

		// 지난 날짜(10-26 빈 배열 제외)는 메모리에 있어 다시 부르지 않는다. 오늘(10-28)과 빈 날만 다시 부른다
		server.reset();
		server.expect(once(), requestTo(url("20261026"))).andRespond(withSuccess("[]", MediaType.APPLICATION_JSON));
		server.expect(once(), requestTo(url("20261028"))).andRespond(withSuccess(WED, MediaType.APPLICATION_JSON));
		List<IndexValue> eur = s.daily(IndexKey.EURKRW, from, to);
		server.verify();
		assertThat(eur).containsExactly(new IndexValue(LocalDate.of(2026, 10, 27), new BigDecimal("1501.3"))); // 10-28은 빈 값

		assertThat(KoreaEximFxSource.parse(TUE)).containsEntry("JPY(100)", new BigDecimal("905.12"))
			.containsEntry("CNH", new BigDecimal("190.21"))
			.doesNotContainKey("KRW");
		assertThat(s.keys()).containsExactlyInAnyOrder(IndexKey.USDKRW, IndexKey.JPYKRW, IndexKey.EURKRW, IndexKey.CNYKRW);
		assertThatThrownBy(() -> s.daily(IndexKey.GOLD, from, to)).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void 키_한도_오류는_실패로_알리고_키가_없으면_칸이_없다() {
		assertThatThrownBy(() -> KoreaEximFxSource.parse("[{\"result\":3,\"cur_unit\":null}]")).hasMessageContaining("인증키");
		assertThatThrownBy(() -> KoreaEximFxSource.parse("[{\"result\":4}]")).hasMessageContaining("한도");
		assertThatThrownBy(() -> KoreaEximFxSource.parse("<html>점검 중</html>")).hasMessageContaining("JSON");
		assertThat(KoreaEximFxSource.parse("")).isEmpty();
		assertThat(KoreaEximFxSource.decimal("0")).isNull();
		assertThat(KoreaEximFxSource.decimal("-1,000")).isNull();
		assertThat(KoreaEximFxSource.decimal("abc")).isNull();
		assertThat(new KoreaEximFxSource(RestClient.create(), BASE, " ", Duration.ZERO).keys()).isEmpty();
	}

	@Test
	void 호출_실패_메시지에_인증키를_남기지_않는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KoreaEximFxSource s = new KoreaEximFxSource(builder.build(), BASE, KEY, Duration.ZERO);
		server.expect(requestTo(url("20261027"))).andRespond(withException(new IOException("connection reset")));

		assertThatThrownBy(() -> s.daily(IndexKey.USDKRW, LocalDate.of(2026, 10, 27), LocalDate.of(2026, 10, 27)))
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("수출입은행")
			.hasMessageNotContaining(KEY);
	}
}
