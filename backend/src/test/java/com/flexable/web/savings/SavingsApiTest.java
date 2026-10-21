package com.flexable.web.savings;

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

import com.flexable.web.savings.SavingsCatalogService.OptionData;
import com.flexable.web.savings.SavingsCatalogService.ProductData;
import com.jayway.jsonpath.JsonPath;

@SpringBootTest
@AutoConfigureMockMvc
class SavingsApiTest {

	@Autowired
	MockMvc mvc;

	@Autowired
	SavingsCatalogService catalog;

	private static ProductData product(String code, String sector, String name, Long maxLimit, String deny, OptionData... options) {
		return new ProductData("0010001", code, sector, "202610", "예시은행", name, "영업점", "만기 후 이율", "우대 원문", deny, "실명의 개인",
				"해당없음", maxLimit, "20261001", null, "202610011000", List.of(options));
	}

	private static OptionData opt(String type, String rsrv, int term, String rate, String rate2) {
		return new OptionData(type, rsrv, term, rate == null ? null : new BigDecimal(rate), rate2 == null ? null : new BigDecimal(rate2));
	}

	@BeforeEach
	void load() {
		catalog.replaceAll(List.of(
				product("A", "BANK", "높은 적금", null, "1", opt("S", "S", 12, "3.50", "4.00"), opt("S", "F", 12, "3.00", "3.20")),
				product("B", "BANK", "낮은 적금", 30_000L, "2", opt("S", "S", 12, "2.00", "5.00")),
				product("C", "SAVINGS_BANK", "저축은행 적금", null, "1", opt("M", "S", 12, "3.80", null), opt("S", "S", 24, "3.90", null)),
				product("D", "BANK", "금리 없는 적금", null, "1", opt("S", "S", 12, null, "2.00"))));
	}

	@Test
	void listsSortedByBaseRateAndCalculatesOnTheServer() throws Exception {
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&sectors=BANK,SAVINGS_BANK"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(3)))
			.andExpect(jsonPath("$.items[0].name").value("저축은행 적금"))
			.andExpect(jsonPath("$.items[0].interestType").value("COMPOUND"))
			.andExpect(jsonPath("$.items[1].name").value("높은 적금"))
			.andExpect(jsonPath("$.items[1].result.interestAfterTax").value(15_010)) // 3.5% 단리 → C-12 예
			.andExpect(jsonPath("$.items[1].sector").value("BANK"))
			.andExpect(jsonPath("$.items[2].result.excludedAmount").value(48_000 * 12))
			.andExpect(jsonPath("$.items[2].openToAll").value(false))
			.andExpect(jsonPath("$.noRateCount").value(1))
			.andExpect(jsonPath("$.disclosureMonth").value("2026-10"))
			.andExpect(jsonPath("$.isSample").value(false));
	}

	@Test
	void filtersByCompanyAndPages() throws Exception {
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&companies=없는은행"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(0));
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&companies=예시은행&size=2&page=3"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(3))
			.andExpect(jsonPath("$.items", hasSize(0)))
			.andExpect(jsonPath("$.page").value(3));
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&size=2&page=2"))
			.andExpect(jsonPath("$.total").value(3))
			.andExpect(jsonPath("$.items", hasSize(1)));
		mvc.perform(get("/api/v1/savings/companies"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$[0].name").value("예시은행"));
	}

	@Test
	void filtersBySectorAndReserveType() throws Exception {
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&sectors=SAVINGS_BANK"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(1)));
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&reserveType=FREE&sectors=BANK"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(1)))
			.andExpect(jsonPath("$.items[0].name").value("높은 적금"));
	}

	@Test
	void sortsByMaxRateAscending() throws Exception {
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&sort=MAX_RATE&direction=ASC"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items[0].name").value("저축은행 적금"))
			.andExpect(jsonPath("$.items[2].name").value("낮은 적금"));
	}

	@Test
	void rejectsBadInput() throws Exception {
		mvc.perform(get("/api/v1/savings/products?monthly=0&termMonths=12")).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12&reserveType=X")).andExpect(status().isBadRequest());
	}

	@Test
	void detailAndSimulateUseTheSameRow() throws Exception {
		String list = mvc.perform(get("/api/v1/savings/products?monthly=78000&termMonths=12"))
			.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		String id = JsonPath.read(list, "$.items[1].id");

		mvc.perform(get("/api/v1/savings/products/" + id + "?termMonths=12"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.specialConditionText").value("우대 원문"))
			.andExpect(jsonPath("$.maxRate").value(4.0));

		mvc.perform(post("/api/v1/savings/simulate").contentType(MediaType.APPLICATION_JSON).content("""
				{"productId":"%s","monthly":78000,"termMonths":12,"reserveType":"FIXED","rateBasis":"MAX"}""".formatted(id)))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.rateBasis").value("MAX"))
			.andExpect(jsonPath("$.principal").value(936_000))
			.andExpect(jsonPath("$.isSample").value(false));

		mvc.perform(get("/api/v1/savings/products/" + id + "?termMonths=36")).andExpect(status().isNotFound());
		mvc.perform(get("/api/v1/savings/products/nope?termMonths=12")).andExpect(status().isNotFound());
	}

	@Test
	void listsPolicies() throws Exception {
		catalog.replacePolicies(List.of(policy("P2", "청년내일저축계좌", "보건복지부"), policy("P1", "청년미래적금", "금융위원회")));
		mvc.perform(get("/api/v1/savings/policies"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$", hasSize(2)))
			.andExpect(jsonPath("$[0].name").value("청년내일저축계좌"))
			.andExpect(jsonPath("$[0].minAge").value(19))
			.andExpect(jsonPath("$[0].maxAge").doesNotExist())
			.andExpect(jsonPath("$[0].region").value("대구"));
		mvc.perform(get("/api/v1/savings/policies?ids=P1"))
			.andExpect(jsonPath("$", hasSize(1)))
			.andExpect(jsonPath("$[0].agency").value("금융위원회"));
	}

	private static SavingsCatalogService.PolicyData policy(String no, String name, String agency) {
		return new SavingsCatalogService.PolicyData(no, name, "설명", "지원 내용", "금융", "취약계층 및 금융지원", agency, "운영기관",
				"20261007 ~ 20261016", null, null, null, "온라인 신청", null, null, "https://example.com", null, null, 19, 0, null, null,
				null, "2026-10-20 00:00:00", "대구");
	}

	@Test
	void snapshotReplacementDropsProductsThatDisappeared() {
		catalog.replaceAll(List.of(product("A", "BANK", "높은 적금", null, "1", opt("S", "S", 12, "3.60", "4.00"))));
		org.assertj.core.api.Assertions.assertThat(catalog.count()).isEqualTo(1);
	}
}
