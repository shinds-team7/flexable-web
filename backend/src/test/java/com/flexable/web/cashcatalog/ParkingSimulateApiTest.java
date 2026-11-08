package com.flexable.web.cashcatalog;

import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:parkingsim;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class ParkingSimulateApiTest {

	@Autowired CashCatalogService catalog;
	@Autowired CashSnapshotRepository snapshots;
	@Autowired MockMvc mvc;

	private static Product parking(String id, String rate, String conditions) {
		return new Product(id, "합성은행", "상품 " + id, "BANK", null, rate == null ? null : new BigDecimal(rate), null,
				"VARIABLE_DEPOSIT", conditions, null, null, null, null, null, "테스트 공시", "https://example.com/d", null,
				null, OffsetDateTime.parse("2026-11-08T09:00:00+09:00"));
	}

	@BeforeEach
	void clean() {
		snapshots.deleteAll();
		catalog.publish("parking", "sim-test", "synthetic", List.of(parking("flat", "3.00", "기본이율 3.00%"),
				parking("tier", "3.00", "3억원 이하 3.2%, 초과 1.5%"), parking("nobase", null, "기본금리 미확인"),
				parking("marginal", "1.20", "기타사항: - 1억원 이하분 연 2.7%\n- 1억원 초과분 연 1.2%")));
	}

	private String id(String name) {
		return catalog.list("parking").items().stream().filter(p -> p.name().equals(name)).findFirst().orElseThrow().id();
	}

	private org.springframework.test.web.servlet.ResultActions simulate(String productId, Object amount, Object days)
			throws Exception {
		return mvc.perform(post("/api/v1/parking/simulate").contentType(MediaType.APPLICATION_JSON).content(
				"{\"productId\":\"" + productId + "\",\"amount\":" + amount + ",\"days\":" + days + "}"));
	}

	@Test
	void 목록에_계산_가능_여부와_이유가_붙는다() throws Exception {
		mvc.perform(get("/api/v1/parking/products")).andExpect(status().isOk())
				.andExpect(jsonPath("$.items[?(@.name=='상품 flat')].calculable").value(true))
				.andExpect(jsonPath("$.items[?(@.name=='상품 tier')].calculable").value(false))
				.andExpect(jsonPath("$.items[?(@.name=='상품 tier')].calcReason").value(ParkingCalculator.TIERED))
				.andExpect(jsonPath("$.items[?(@.name=='상품 nobase')].calcReason").value(ParkingCalculator.NO_BASE));
	}

	@Test
	void 계산_가능한_상품은_서버가_이자를_계산한다() throws Exception {
		simulate(id("상품 flat"), 10_000_000, 31).andExpect(status().isOk())
				.andExpect(jsonPath("$.interestPreTax").value(25479)).andExpect(jsonPath("$.tax").value(3923))
				.andExpect(jsonPath("$.interestAfterTax").value(21556))
				.andExpect(jsonPath("$.rulesVersion").value("parking-calc-v2"));
	}

	@Test
	void 원문에_구간별_적용이_적힌_상품은_구간_금리로_계산한다() throws Exception {
		mvc.perform(get("/api/v1/parking/products")).andExpect(status().isOk())
				.andExpect(jsonPath("$.items[?(@.name=='상품 marginal')].calcMode").value("TIERED"))
				.andExpect(jsonPath("$.items[?(@.name=='상품 flat')].calcMode").value("BASE_RATE"));
		// 1억원 이하분 2.7% + 5천만원(초과분) 1.2%, 365일: 2,700,000 + 600,000
		simulate(id("상품 marginal"), 150_000_000, 365).andExpect(status().isOk())
				.andExpect(jsonPath("$.mode").value("TIERED")).andExpect(jsonPath("$.interestPreTax").value(3300000))
				.andExpect(jsonPath("$.parts.length()").value(2)).andExpect(jsonPath("$.parts[1].amount").value(50000000));
	}

	@Test
	void 계산_불가_상품과_잘못된_입력은_400이고_없는_상품은_404다() throws Exception {
		simulate(id("상품 tier"), 10_000_000, 31).andExpect(status().isBadRequest());
		simulate(id("상품 nobase"), 10_000_000, 31).andExpect(status().isBadRequest());
		simulate(id("상품 flat"), 0, 31).andExpect(status().isBadRequest());
		simulate(id("상품 flat"), 10_000_000_001L, 31).andExpect(status().isBadRequest());
		simulate(id("상품 flat"), 10_000_000, 0).andExpect(status().isBadRequest());
		simulate(id("상품 flat"), 10_000_000, 3651).andExpect(status().isBadRequest());
		simulate("없는-상품", 10_000_000, 31).andExpect(status().isNotFound());
		mvc.perform(post("/api/v1/parking/simulate").contentType(MediaType.APPLICATION_JSON).content("{}"))
				.andExpect(status().isBadRequest());
	}
}
