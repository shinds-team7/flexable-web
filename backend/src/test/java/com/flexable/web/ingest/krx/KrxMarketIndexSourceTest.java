package com.flexable.web.ingest.krx;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/** KRX Open API 채권지수 시세정보·금시장 일별매매정보 응답 fixture(필드 이름은 KRX 개발 명세 기준). 외부 호출 없음. */
class KrxMarketIndexSourceTest {

	private static final String BASE = "https://krx.test/svc/apis";

	private static KrxMarketIndexSource source(RestClient http, String key) {
		return new KrxMarketIndexSource(http, BASE, key, "KRX 채권지수", "04020000", Duration.ZERO);
	}

	@Test
	void 채권지수는_설정한_그룹의_총수익지수를_고르고_휴장일과_결측은_뺀다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KrxMarketIndexSource s = source(builder.build(), "K");

		server.expect(requestTo(BASE + "/idx/bon_dd_trd?basDd=20261027")).andExpect(header("AUTH_KEY", "K"))
			.andRespond(withSuccess("""
					{"OutBlock_1":[
					 {"BAS_DD":"20261027","BND_IDX_GRP_NM":"KTB 지수","TOT_EARNG_IDX":"12,345.67","NETPRC_IDX":"10,001.00"},
					 {"BAS_DD":"20261027","BND_IDX_GRP_NM":"KRX 채권지수","TOT_EARNG_IDX":"191.35","TOT_EARNG_IDX_CMPPREVDD":"-0.12","NETPRC_IDX":"110.02"}]}
					""", MediaType.APPLICATION_JSON));
		server.expect(requestTo(BASE + "/idx/bon_dd_trd?basDd=20261028")).andRespond(withSuccess("{\"OutBlock_1\":[]}", MediaType.APPLICATION_JSON));
		server.expect(requestTo(BASE + "/idx/bon_dd_trd?basDd=20261029"))
			.andRespond(withSuccess("{\"OutBlock_1\":[{\"BND_IDX_GRP_NM\":\"KRX 채권지수\",\"TOT_EARNG_IDX\":\"-\"}]}", MediaType.APPLICATION_JSON));

		// 10-25(일)·10-26(월)은 범위 밖, 10-27~29만 부른다
		assertThat(s.daily(IndexKey.KRXBOND, LocalDate.of(2026, 10, 27), LocalDate.of(2026, 10, 29)))
			.containsExactly(new IndexValue(LocalDate.of(2026, 10, 27), new BigDecimal("191.35")));
		server.verify();
	}

	@Test
	void 금은_설정한_종목의_종가를_원_단위로_고르고_주말은_부르지_않는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KrxMarketIndexSource s = source(builder.build(), "K");

		server.expect(requestTo(BASE + "/gen/gold_bydd_trd?basDd=20261023")).andRespond(withSuccess("""
				{"OutBlock_1":[
				 {"BAS_DD":"20261023","ISU_CD":"04020100","ISU_NM":"미니금 100g","TDD_CLSPRC":"151,900"},
				 {"BAS_DD":"20261023","ISU_CD":"04020000","ISU_NM":"금 99.99_1Kg","TDD_CLSPRC":"151,200","CMPPREVDD_PRC":"-400"}]}
				""", MediaType.APPLICATION_JSON));
		server.expect(requestTo(BASE + "/gen/gold_bydd_trd?basDd=20261026")).andRespond(withSuccess("""
				{"OutBlock_1":[{"ISU_CD":"04020000","TDD_CLSPRC":"150800"}]}
				""", MediaType.APPLICATION_JSON));

		assertThat(s.daily(IndexKey.GOLD, LocalDate.of(2026, 10, 23), LocalDate.of(2026, 10, 26))).containsExactly(
				new IndexValue(LocalDate.of(2026, 10, 23), new BigDecimal("151200")), new IndexValue(LocalDate.of(2026, 10, 26), new BigDecimal("150800")));
		server.verify();
	}

	@Test
	void 설정값이_틀리면_실제_이름을_담아_실패하고_키가_없으면_칸이_없다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		KrxMarketIndexSource s = new KrxMarketIndexSource(builder.build(), BASE, "K", "없는 지수", "04020000", Duration.ZERO);
		server.expect(requestTo(BASE + "/idx/bon_dd_trd?basDd=20261027")).andRespond(withSuccess(
				"{\"OutBlock_1\":[{\"BND_IDX_GRP_NM\":\"KRX 채권지수\",\"TOT_EARNG_IDX\":\"191.35\"},{\"BND_IDX_GRP_NM\":\"KTB 지수\"}]}",
				MediaType.APPLICATION_JSON));

		assertThatThrownBy(() -> s.daily(IndexKey.KRXBOND, LocalDate.of(2026, 10, 27), LocalDate.of(2026, 10, 27)))
			.hasMessageContaining("없는 지수")
			.hasMessageContaining("KRX 채권지수, KTB 지수");
		assertThat(source(RestClient.create(), "").keys()).isEmpty();
		assertThat(s.keys()).containsExactlyInAnyOrder(IndexKey.KRXBOND, IndexKey.GOLD);
		assertThatThrownBy(() -> s.daily(IndexKey.USDKRW, LocalDate.of(2026, 10, 27), LocalDate.of(2026, 10, 27)))
			.isInstanceOf(IllegalArgumentException.class);
	}
}
