package com.flexable.web.deposit;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.flexable.web.deposit.DepositCatalogService.OptionData;
import com.flexable.web.deposit.DepositCatalogService.ProductData;

@SpringBootTest
@AutoConfigureMockMvc
class DepositApiTest {

	@Autowired
	MockMvc mvc;

	@Autowired
	DepositCatalogService catalog;

	private static ProductData product(String code, String sector, String name, Long maxLimit, String deny, OptionData... options) {
		return new ProductData("0010001", code, sector, "202610", "예시은행", name, "영업점", "만기 후 이율", "우대 원문", deny, "실명의 개인",
				"해당없음", maxLimit, "20261001", null, "202610011000", List.of(options));
	}

	private static OptionData opt(String type, int term, String rate, String rate2) {
		return new OptionData(type, term, rate == null ? null : new BigDecimal(rate), rate2 == null ? null : new BigDecimal(rate2));
	}

	@BeforeEach
	void load() {
		catalog.replaceAll(List.of(
				product("A", "BANK", "높은 예금", null, "1", opt("S", 12, "3.50", "4.00"), opt("M", 12, "3.40", null)),
				product("B", "BANK", "한도 있는 예금", 20_000_000L, "2", opt("S", 12, "2.00", "5.00")),
				product("C", "SAVINGS_BANK", "저축은행 예금", null, "1", opt("M", 12, "3.80", null), opt("S", 24, "3.90", null)),
				product("D", "BANK", "금리 없는 예금", null, "1", opt("S", 12, null, "2.00"))));
	}

	@Test
	void listsSortedByBaseRateAndCalculatesOnTheServer() throws Exception {
		mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12&sectors=BANK,SAVINGS_BANK"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(3)))
			.andExpect(jsonPath("$.items[0].name").value("저축은행 예금"))
			.andExpect(jsonPath("$.items[0].interestType").value("COMPOUND"))
			.andExpect(jsonPath("$.items[1].name").value("높은 예금"))
			.andExpect(jsonPath("$.items[1].interestType").value("SIMPLE")) // 같은 기간에 단리·복리가 있으면 기본금리가 높은 쪽
			.andExpect(jsonPath("$.items[1].result.interestPreTax").value(350_000))
			.andExpect(jsonPath("$.items[1].result.interestAfterTax").value(296_100))
			.andExpect(jsonPath("$.items[1].result.maturityAmount").value(10_296_100))
			.andExpect(jsonPath("$.items[2].openToAll").value(false))
			.andExpect(jsonPath("$.noRateCount").value(1))
			.andExpect(jsonPath("$.disclosureMonth").value("2026-10"))
			.andExpect(jsonPath("$.isSample").value(false));
	}

	@Test
	void excludesAmountOverTheJoinLimit() throws Exception {
		mvc.perform(get("/api/v1/deposit/products?amount=30000000&termMonths=12&sort=BASE_RATE&direction=ASC"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].name").value("한도 있는 예금"))
			.andExpect(jsonPath("$.items[0].result.principal").value(20_000_000))
			.andExpect(jsonPath("$.items[0].result.excludedAmount").value(10_000_000))
			.andExpect(jsonPath("$.items[0].result.interestPreTax").value(400_000));
	}

	@Test
	void filtersByInterestTypeSectorAndCompany() throws Exception {
		mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12&interestType=COMPOUND"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(2)) // 저축은행 예금, 높은 예금의 복리 줄
			.andExpect(jsonPath("$.items[1].baseRate").value(3.40));
		mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12&sectors=SAVINGS_BANK"))
			.andExpect(jsonPath("$.total").value(1));
		mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12&companies=없는은행"))
			.andExpect(jsonPath("$.total").value(0));
		mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12&size=2&page=3"))
			.andExpect(jsonPath("$.items", hasSize(0)))
			.andExpect(jsonPath("$.total").value(3));
	}

	@Test
	void rejectsBadInput() throws Exception {
		mvc.perform(get("/api/v1/deposit/products?amount=0&termMonths=12")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/deposit/products?amount=1&termMonths=0")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/deposit/products?amount=1&termMonths=12&sort=NOPE")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/deposit/products?amount=1&termMonths=12&interestType=NOPE")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/deposit/products?amount=1&termMonths=12&sectors=NOPE")).andExpect(status().isBadRequest());
	}

	@Test
	void companiesAreDistinctPerSector() throws Exception {
		mvc.perform(get("/api/v1/deposit/companies"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(2))) // 회사 이름이 같아도 금융권이 다르면 따로 센다
			.andExpect(jsonPath("$[0].name").value("예시은행"));
	}

	@Test
	void simulatesWithSeriesAndAssumptions() throws Exception {
		String list = mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12"))
			.andReturn()
			.getResponse()
			.getContentAsString(StandardCharsets.UTF_8);
		String id = com.jayway.jsonpath.JsonPath.read(list, "$.items[1].id");
		mvc.perform(post("/api/v1/deposit/simulate").contentType(MediaType.APPLICATION_JSON)
			.content("{\"productId\":\"" + id + "\",\"amount\":10000000,\"termMonths\":12,\"interestType\":\"SIMPLE\",\"rateBasis\":\"MAX\"}"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.interestPreTax").value(400_000)) // 최고 4.00% 단리
			.andExpect(jsonPath("$.series", hasSize(12)))
			.andExpect(jsonPath("$.series[11].interestPreTax").value(400_000))
			.andExpect(jsonPath("$.series[0].principal").value(10_000_000))
			.andExpect(jsonPath("$.isSample").value(false));
		mvc.perform(post("/api/v1/deposit/simulate").contentType(MediaType.APPLICATION_JSON)
			.content("{\"productId\":\"" + id + "\",\"amount\":10000000,\"termMonths\":24,\"interestType\":\"SIMPLE\",\"rateBasis\":\"BASE\"}"))
			.andExpect(status().isNotFound());
	}

	@Test
	void detailReturnsSpecialConditionText() throws Exception {
		String list = mvc.perform(get("/api/v1/deposit/products?amount=10000000&termMonths=12"))
			.andReturn()
			.getResponse()
			.getContentAsString(StandardCharsets.UTF_8);
		String id = com.jayway.jsonpath.JsonPath.read(list, "$.items[1].id");
		mvc.perform(get("/api/v1/deposit/products/" + id + "?termMonths=12"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.specialConditionText").value("우대 원문"));
		mvc.perform(get("/api/v1/deposit/products/abc?termMonths=12")).andExpect(status().isNotFound());
	}
}
