package com.flexable.web.cashcatalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/** 목표 달성 시나리오(policies §7-2)가 CMA 금리로 쓰는 공시 기본금리의 중간값. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:cmamedian;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
class CmaMedianRateTest {

	@Autowired CashCatalogService catalog;
	@Autowired CashSnapshotRepository snapshots;

	private static Product cma(String name, String base) {
		return new Product(name, "합성증권", name, "SECURITIES", "RP", base == null ? null : new BigDecimal(base),
				base == null ? null : new BigDecimal(base), "AGREED", "개인 자동투자상품", null, null, null, null, null, "테스트",
				"https://example.com/c", null, null, OffsetDateTime.parse("2026-11-08T09:00:00+09:00"));
	}

	@Test
	void 공시가_없으면_빈_값() {
		snapshots.deleteAll();
		assertThat(catalog.cmaMedianRate()).isEmpty();
	}

	@Test
	void 홀수_개는_가운데_값_기본금리가_없는_상품은_뺀다() {
		snapshots.deleteAll();
		catalog.publish("cma", "median-odd", "synthetic", List.of(cma("a", "2.20"), cma("b", "3.00"), cma("c", "2.50"), cma("d", null)));
		assertThat(catalog.cmaMedianRate()).contains(new BigDecimal("2.50"));
	}

	@Test
	void 짝수_개는_가운데_두_값의_평균을_소수_둘째_자리로_반올림() {
		snapshots.deleteAll();
		catalog.publish("cma", "median-even", "synthetic", List.of(cma("a", "2.20"), cma("b", "2.55"), cma("c", "2.60"), cma("d", "3.10")));
		// (2.55 + 2.60) ÷ 2 = 2.575 → 2.58
		assertThat(catalog.cmaMedianRate()).contains(new BigDecimal("2.58"));
	}
}
