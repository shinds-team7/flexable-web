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
import org.springframework.test.web.servlet.ResultActions;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:cmasim;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class CmaSimulateApiTest {

	@Autowired CashCatalogService catalog;
	@Autowired CashSnapshotRepository snapshots;
	@Autowired MockMvc mvc;

	private static Product cma(String name, String base, String max, String conditions) {
		return new Product(name, "합성증권", name, "SECURITIES", "RP", base == null ? null : new BigDecimal(base),
				max == null ? null : new BigDecimal(max), "AGREED", conditions, null, null, null, null, null, "테스트", "https://example.com/c",
				null, null, OffsetDateTime.parse("2026-11-08T09:00:00+09:00"));
	}

	@BeforeEach
	void seed() {
		snapshots.deleteAll();
		catalog.publish("cma", "cma-sim", "synthetic", List.of(cma("단일", "2.50", "2.50", "개인 자동투자상품"),
				cma("기간별", "2.75", "2.90", "1일 ~ 15일 : 2.75%\n16일 ~ 60일 : 2.78%\n61일 ~ 180일 : 2.90%"),
				cma("범위", null, "2.60", "공시 금액 구간별 세전 연 2.45% ~ 2.60%")));
	}

	private String id(String name) {
		return catalog.list("cma").items().stream().filter(p -> p.name().equals(name)).findFirst().orElseThrow().id();
	}

	private ResultActions simulate(String productId, Object amount, Object days) throws Exception {
		return mvc.perform(post("/api/v1/cma/simulate").contentType(MediaType.APPLICATION_JSON)
				.content("{\"productId\":\"" + productId + "\",\"amount\":" + amount + ",\"days\":" + days + "}"));
	}

	@Test
	void 목록에_계산_방식이_붙는다() throws Exception {
		mvc.perform(get("/api/v1/cma/products")).andExpect(status().isOk())
				.andExpect(jsonPath("$.items[?(@.name=='단일')].calcMode").value("AGREED_RATE"))
				.andExpect(jsonPath("$.items[?(@.name=='기간별')].calcMode").value("PERIOD_RATE"))
				.andExpect(jsonPath("$.items[?(@.name=='기간별')].periods.length()").value(3))
				.andExpect(jsonPath("$.items[?(@.name=='범위')].calculable").value(false))
				.andExpect(jsonPath("$.items[?(@.name=='범위')].calcReason").value(CmaCalculator.NO_RATE));
	}

	@Test
	void 단일_수익률은_서버가_계산한다() throws Exception {
		simulate(id("단일"), 10_000_000, 31).andExpect(status().isOk()).andExpect(jsonPath("$.interestPreTax").value(21232))
				.andExpect(jsonPath("$.tax").value(3269)).andExpect(jsonPath("$.interestAfterTax").value(17963))
				.andExpect(jsonPath("$.mode").value("AGREED_RATE")).andExpect(jsonPath("$.rulesVersion").value("cma-calc-v1"));
	}

	@Test
	void 보유_기간이_속한_구간의_수익률로_계산하고_구간_밖은_400이다() throws Exception {
		simulate(id("기간별"), 10_000_000, 100).andExpect(status().isOk()).andExpect(jsonPath("$.rate").value(2.9))
				.andExpect(jsonPath("$.mode").value("PERIOD_RATE"));
		simulate(id("기간별"), 10_000_000, 16).andExpect(status().isOk()).andExpect(jsonPath("$.rate").value(2.78));
		simulate(id("기간별"), 10_000_000, 181).andExpect(status().isBadRequest());
	}

	@Test
	void 계산_불가_상품_잘못된_입력_없는_상품() throws Exception {
		simulate(id("범위"), 10_000_000, 31).andExpect(status().isBadRequest());
		simulate(id("단일"), 0, 31).andExpect(status().isBadRequest());
		simulate(id("단일"), 10_000_000, 0).andExpect(status().isBadRequest());
		simulate("없는-상품", 10_000_000, 31).andExpect(status().isNotFound());
	}
}
