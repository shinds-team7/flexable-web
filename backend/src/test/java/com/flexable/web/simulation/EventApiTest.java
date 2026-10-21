package com.flexable.web.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;
import static org.hamcrest.Matchers.closeTo;
import static org.hamcrest.Matchers.greaterThan;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.hamcrest.Matchers.startsWith;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.jayway.jsonpath.JsonPath;
import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketService;

/**
 * 시뮬레이션 응답의 사건 후보(events[])와 사건 상세(GET /market/events/{id}).
 * 삼성전자에 석 달 전 하루 +20%, 2년 전(계산 기간 밖) 하루 +20%를 넣고, worker 대신 EventService로 탐지·근거를 넣는다.
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:eventapi;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class EventApiTest {

	@Autowired
	MockMvc mvc;

	@Autowired
	MarketService market;

	@Autowired
	EventService events;

	private static boolean seeded;
	private static LocalDate jumpDate;

	@BeforeEach
	void seed() {
		if (seeded) {
			return;
		}
		seeded = true;
		LocalDate today = LocalDate.now();
		market.replaceBoard(Board.KOSPI, List.of(new InstrumentRow("005930", "삼성전자", "KOSPI", "STOCK", 900L)), "테스트 목록", null, today);
		market.replaceBoard(Board.ETF, List.of(new InstrumentRow("069500", "KODEX 200", null, "ETF", 120L)), "테스트 목록", null, today);
		List<LocalDate> dates = new ArrayList<>();
		for (LocalDate d = today.minusYears(3); !d.isAfter(today); d = d.plusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				dates.add(d);
			}
		}
		int jump = dates.size() - 60;
		int old = dates.size() - 500;
		jumpDate = dates.get(jump);
		Random rnd = new Random(3);
		List<DailyClose> proxy = new ArrayList<>();
		List<DailyClose> stock = new ArrayList<>();
		double m = Math.log(30_000), s = Math.log(60_000);
		for (int i = 0; i < dates.size(); i++) {
			if (i > 0) {
				double mr = rnd.nextGaussian() * 0.008;
				m += mr;
				s += mr + rnd.nextGaussian() * 0.004 + (i == jump || i == old ? Math.log(1.2) : 0);
			}
			proxy.add(new DailyClose(dates.get(i), Math.round(Math.exp(m))));
			stock.add(new DailyClose(dates.get(i), Math.round(Math.exp(s))));
		}
		market.saveDailyCloses("069500", proxy, Map.of(), "테스트");
		market.saveDailyCloses("005930", stock, Map.of(), "테스트");
		events.detect("069500");
		events.detect("005930");
		long id = events.events("005930").stream().filter(e -> e.startDate().equals(jumpDate)).findFirst().orElseThrow().id();
		events.saveEvidence(id, "DART", List.of(new EvidenceRow("DART", "20990101000001", "단일판매ㆍ공급계약체결", "삼성전자", jumpDate,
				"https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20990101000001", 3)));
	}

	private String run() throws Exception {
		String start = LocalDate.now().minusYears(1).withDayOfMonth(1).toString();
		return mvc.perform(post("/api/v1/simulations/run").contentType(MediaType.APPLICATION_JSON)
				.content("{\"startDate\":\"" + start + "\",\"funding\":{\"mode\":\"LUMP_SUM\",\"totalAmount\":1000000},"
						+ "\"legs\":[{\"instrumentId\":\"005930\"}]}"))
			.andExpect(status().isOk())
			.andReturn().getResponse().getContentAsString();
	}

	@Test
	void 시뮬레이션_기간_안_사건과_그때_내_돈() throws Exception {
		String body = run();
		String start = LocalDate.now().minusYears(1).withDayOfMonth(1).toString();
		// 2년 전 급등은 계산 기간 밖이라 오지 않는다
		List<String> starts = JsonPath.read(body, "$.events[?(@.scope == 'STOCK')].startDate");
		assertThat(starts).isNotEmpty().allMatch(d -> d.compareTo(start) >= 0);
		List<Map<String, Object>> found = JsonPath.read(body, "$.events[?(@.startDate == '" + jumpDate + "' && @.scope == 'STOCK')]");
		assertThat(found).hasSize(1);
		Map<String, Object> e = found.getFirst();
		assertThat(e.get("code")).isEqualTo("005930");
		assertThat(e.get("direction")).isEqualTo("RISE");
		assertThat(e.get("headline")).isEqualTo("삼성전자 하루 급등");
		assertThat(e.get("sourceName")).isEqualTo("DART 공시");
		assertThat(e.get("topSource")).isEqualTo("단일판매ㆍ공급계약체결");
		assertThat(e.get("noticeKey")).isEqualTo("EVENT_EXPLAIN");
		long before = ((Number) e.get("valueBefore")).longValue();
		long after = ((Number) e.get("valueAfter")).longValue();
		long added = ((Number) e.get("contributionInWindow")).longValue();
		assertThat(added).isZero(); // 한 번에 넣었다
		assertThat(((Number) e.get("valueChange")).longValue()).isEqualTo(after - before - added);
		assertThat((double) after / before - 1).isCloseTo(((Number) e.get("returnRate")).doubleValue(), within(0.001));
	}

	@Test
	void 사건_상세는_시장_반응과_그_뒤_근거를_준다() throws Exception {
		long id = events.events("005930").stream().filter(x -> x.startDate().equals(jumpDate)).findFirst().orElseThrow().id();
		mvc.perform(get("/api/v1/market/events/" + id))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.name", is("삼성전자")))
			.andExpect(jsonPath("$.headline", is("삼성전자 하루 급등")))
			.andExpect(jsonPath("$.marketReaction.returnRate", closeTo(0.2, 0.03)))
			.andExpect(jsonPath("$.marketReaction.weekReturn", greaterThan(0.1)))
			.andExpect(jsonPath("$.afterwards.d30").isNumber())
			.andExpect(jsonPath("$.afterwards.d365", nullValue()))
			.andExpect(jsonPath("$.sources", hasSize(1)))
			.andExpect(jsonPath("$.sources[0].url", startsWith("https://dart.fss.or.kr/")))
			.andExpect(jsonPath("$.whatHappened", startsWith("삼성전자 주가가 " + jumpDate.toString().replace('-', '.') + " 하루 +")))
			.andExpect(jsonPath("$.whatHappened", org.hamcrest.Matchers.endsWith("이 기간에 공시 1건이 나왔어요.")))
			.andExpect(jsonPath("$.aiGenerated", is(false)))
			.andExpect(jsonPath("$.confidence", is("MEDIUM")))
			.andExpect(jsonPath("$.newsSearchUrl", startsWith("https://search.naver.com/")))
			.andExpect(jsonPath("$.noticeKey", is("EVENT_EXPLAIN")));
		mvc.perform(get("/api/v1/market/events/999999")).andExpect(status().isNotFound());
	}
}
