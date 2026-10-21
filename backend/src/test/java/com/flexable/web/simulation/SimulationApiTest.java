package com.flexable.web.simulation;

import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.flexable.web.ingest.fake.FakePriceSource;
import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketService;

/** api는 DB에 모아 둔 시세만 읽는다. 여기서는 worker 대신 MarketService로 미리 넣어 둔다(외부 호출 없음). */
@SpringBootTest
@AutoConfigureMockMvc
class SimulationApiTest {

	@Autowired
	MockMvc mvc;

	@Autowired
	MarketService market;

	private static boolean seeded;

	private final String start = LocalDate.now().minusYears(1).withDayOfMonth(1).toString();

	@BeforeEach
	void seed() {
		if (seeded) {
			return;
		}
		seeded = true;
		LocalDate today = LocalDate.now();
		market.replaceBoard(Board.KOSPI, List.of(
				new InstrumentRow("005930", "삼성전자", "KOSPI", "STOCK", 900L),
				new InstrumentRow("000660", "SK하이닉스", "KOSPI", "STOCK", 800L),
				new InstrumentRow("105560", "KB금융", "KOSPI", "STOCK", 400L),
				new InstrumentRow("035420", "NAVER", "KOSPI", "STOCK", 300L)), "테스트 목록", null, today);
		market.replaceBoard(Board.ETF, List.of(
				new InstrumentRow("069500", "KODEX 200", null, "ETF", 120L),
				new InstrumentRow("102110", "TIGER 200", null, "ETF", 100L),
				new InstrumentRow("360750", "TIGER 미국S&P500", null, "ETF", 90L)), "대체 목록", "기본 소스 실패", today);
		FakePriceSource fake = new FakePriceSource();
		// 360750은 아직 시세를 모으지 않은 종목으로 둔다
		for (String code : List.of("005930", "000660", "105560", "035420", "069500", "102110")) {
			var closes = fake.dailyBars(code, today.minusYears(2), today).stream().map(b -> new DailyClose(b.date(), b.close())).toList();
			market.saveDailyCloses(code, closes, Map.of(), fake.source());
		}
	}

	private String body(String mode, String amountField, long amount, String legs) {
		return "{\"startDate\":\"" + start + "\",\"funding\":{\"mode\":\"" + mode + "\",\"" + amountField + "\":" + amount
				+ "},\"legs\":[" + legs + "]}";
	}

	@Test
	void 종목_목록은_시장별_시가총액_순() throws Exception {
		mvc.perform(get("/api/v1/market/instruments?board=KOSPI"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.board", is("KOSPI")))
			.andExpect(jsonPath("$.items", hasSize(4)))
			.andExpect(jsonPath("$.items[0].id", is("005930")))
			.andExpect(jsonPath("$.items[0].rank", is(1)))
			.andExpect(jsonPath("$.items[2].id", is("105560")));
		mvc.perform(get("/api/v1/market/instruments?board=ETF"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.note", is("기본 소스 실패")))
			.andExpect(jsonPath("$.items[0].kind", is("ETF")));
		mvc.perform(get("/api/v1/market/instruments?board=KOSDAQ"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(0)));
		mvc.perform(get("/api/v1/market/instruments?board=NOPE")).andExpect(status().isBadRequest());
	}

	@Test
	void 비로그인으로_계산한다() throws Exception {
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("LUMP_SUM", "totalAmount", 470_000, "{\"instrumentId\":\"005930\"},{\"instrumentId\":\"102110\"}")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.totalInvested", is(470000)))
			.andExpect(jsonPath("$.legs[0].invested", is(235000)))
			.andExpect(jsonPath("$.series.length()", greaterThan(40)))
			.andExpect(jsonPath("$.seriesBasis", is("WEEK_LAST_CLOSE")))
			.andExpect(jsonPath("$.noticeKey", is("SIM_PAST")))
			.andExpect(jsonPath("$.sources[0].name", is("테스트용 가짜 시세")));
	}

	@Test
	void 사용자가_고른_비율로_나눠_넣는다() throws Exception {
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("LUMP_SUM", "totalAmount", 470_000,
						"{\"instrumentId\":\"005930\",\"weight\":0.7},{\"instrumentId\":\"102110\",\"weight\":0.3}")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.legs[0].invested", is(329000)))
			.andExpect(jsonPath("$.legs[1].invested", is(141000)));
	}

	@Test
	void 매달_나눠서는_정한_금액이_매달_쌓인다() throws Exception {
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("SPLIT", "monthlyAmount", 1_000_000, "{\"instrumentId\":\"005930\"}")))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.contributionCount", is(13)))
			.andExpect(jsonPath("$.series[0].invested", is(1000000)))
			.andExpect(jsonPath("$.series[0].contributed", is(1000000)))
			.andExpect(jsonPath("$.totalInvested", is(13000000)));
	}

	@Test
	void 시세를_아직_모으지_않은_종목은_503과_종목_코드() throws Exception {
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("LUMP_SUM", "totalAmount", 470_000, "{\"instrumentId\":\"005930\"},{\"instrumentId\":\"360750\"}")))
			.andExpect(status().isServiceUnavailable())
			.andExpect(jsonPath("$.code", is("MARKET_UNAVAILABLE")))
			.andExpect(jsonPath("$.field", is("360750")));
	}

	@Test
	void 입력을_검사한다() throws Exception {
		// 목록 밖 종목
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("LUMP_SUM", "totalAmount", 470_000, "{\"instrumentId\":\"999999\"}")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.legs").exists());
		// 금액 범위
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("PACE", "monthlyAmount", 10, "{\"instrumentId\":\"005930\"}")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields['funding.monthlyAmount']").exists());
		// 4종목
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("LUMP_SUM", "totalAmount", 470_000, "{\"instrumentId\":\"005930\"},{\"instrumentId\":\"102110\"},"
						+ "{\"instrumentId\":\"000660\"},{\"instrumentId\":\"035420\"}")))
			.andExpect(status().isBadRequest());
		// 비율 합 ≠ 100%
		mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content(body("LUMP_SUM", "totalAmount", 470_000,
						"{\"instrumentId\":\"005930\",\"weight\":0.6},{\"instrumentId\":\"102110\",\"weight\":0.3}")))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.legs").exists());
	}
}
