package com.flexable.web.cashcatalog;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:cashcatalog;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class CashCatalogTest {
    @Autowired CashCatalogService catalog;
    @Autowired CashSnapshotRepository snapshots;
    @Autowired MockMvc mvc;

    static Product product(String id, String name, String sector, String category, String conditions) {
        return new Product(id, "합성금융회사", name, sector, category, new BigDecimal("2.50"), null,
                category == null ? "VARIABLE_DEPOSIT" : "AGREED", conditions,
                null, null, null, null, null, "테스트 공시", "https://example.com/disclosure", null, null,
                OffsetDateTime.parse("2026-11-04T09:00:00+09:00"));
    }
    @BeforeEach void clean() { snapshots.deleteAll(); }

    @Test void publicationRoundTripAndPublicJsonKeepKoreanOffset() throws Exception {
        var p = product("one", "시간 검증", "BANK", null, "조건");
        catalog.publish("parking", "time-test", "synthetic", List.of(p));
        assertThat(catalog.list("parking").items().getFirst().verifiedAt()).isEqualTo(p.verifiedAt());
        assertThat(catalog.list("parking").items().getFirst().verifiedAt().getOffset()).isEqualTo(java.time.ZoneOffset.ofHours(9));
        assertThat(catalog.needsRefresh("parking", "time-test", p.verifiedAt().toInstant().minusSeconds(1))).isFalse();
        mvc.perform(get("/api/v1/parking/products")).andExpect(status().isOk())
            .andExpect(jsonPath("$.items[0].verifiedAt").value("2026-11-04T09:00:00.000+09:00"));
    }

    @Test void emptyPublicCatalogIsNotSampleAndHasNoCalculation() throws Exception {
        mvc.perform(get("/api/v1/parking/products")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty()).andExpect(jsonPath("$.isSample").value(false));
        mvc.perform(get("/api/v1/cma/products")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items").isEmpty());
        mvc.perform(post("/api/v1/cma/products")).andExpect(status().isUnauthorized());
    }

    @Test void legacySnapshotWithoutCalculationFieldsCanBeReadAndRefreshed() throws Exception {
        var p = product("legacy", "이전 상품", "BANK", null, "조건");
        catalog.publish("parking", "legacy-source", "synthetic", List.of(p));
        var snapshot = snapshots.findAll().getFirst();
        var json = tools.jackson.databind.json.JsonMapper.builder().build();
        var payload = json.readTree(snapshot.payload);
        var item = (tools.jackson.databind.node.ObjectNode) payload.get(0);
        for (String field : List.of("tags", "calculable", "calcReason", "calcMode", "tiers", "periods")) item.remove(field);
        snapshot.payload = json.writeValueAsString(payload);
        snapshots.saveAndFlush(snapshot);

        assertThat(catalog.needsRefresh("parking", "legacy-source", p.verifiedAt().toInstant().minusSeconds(1))).isFalse();
        assertThat(catalog.needsRefresh("parking", "legacy-source", p.verifiedAt().toInstant().plusSeconds(1))).isTrue();
        mvc.perform(get("/api/v1/parking/products")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].calculable").value(true))
                .andExpect(jsonPath("$.items[0].calcMode").value("BASE_RATE"));
    }

    @Test void replacementIsPerSourceAndIdsRemainStable() {
        catalog.publish("parking", "source-a", "permission-test-a", List.of(product("one", "이전 상품", "BANK", null, "구간 조건")));
        String id = catalog.list("parking").items().getFirst().id();
        catalog.publish("parking", "source-b", "permission-test-b", List.of(product("one", "다른 출처 상품", "SAVINGS_BANK", null, "조건")));
        catalog.publish("parking", "source-a", "permission-test-a", List.of(product("one", "갱신 상품", "BANK", null, "갱신 조건")));
        assertThat(catalog.list("parking").items()).hasSize(2).anySatisfy(p -> {
            assertThat(p.id()).isEqualTo(id);
            assertThat(p.name()).isEqualTo("갱신 상품");
        });
        catalog.withdraw("parking", "source-a");
        assertThat(catalog.list("parking").items()).singleElement().extracting(Product::name).isEqualTo("다른 출처 상품");
    }

    @Test void invalidSnapshotsPreserveThePreviousPublication() {
        Product valid = product("one", "정상 상품", "BANK", null, "조건");
        catalog.publish("parking", "source-a", "permission-test", List.of(valid));
        assertThatThrownBy(() -> catalog.publish("parking", "source-a", "permission-test", List.of())).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.publish("parking", "source-a", "", List.of(valid))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.publish("parking", "source-a", "permission-test", List.of(valid, valid))).isInstanceOf(IllegalArgumentException.class);
        assertThatThrownBy(() -> catalog.publish("parking", "source-a", "permission-test", List.of(valid,
                product("two", "잘못된 상품", "BANK", null, "")))).isInstanceOf(IllegalArgumentException.class);
        assertThat(catalog.list("parking").items()).singleElement().extracting(Product::name).isEqualTo("정상 상품");
    }

    @Test void cmaOnlyAcceptsAgreedRpAndPromissoryNoteAndKeepsUnknowns() throws Exception {
        catalog.publish("cma", "broker", "permission-test", List.of(product("rp", "RP 상품", "SECURITIES", "RP", "1~30일 약정수익률, 재투자 조건 확인"),
                product("note", "발행어음 상품", "SECURITIES", "PROMISSORY_NOTE", "상품 공시 조건")));
        assertThatThrownBy(() -> catalog.publish("cma", "broker", "permission-test",
                List.of(product("mmf", "MMF 상품", "SECURITIES", "MMF", "조건")))).isInstanceOf(IllegalArgumentException.class);
        mvc.perform(get("/api/v1/cma/products")).andExpect(status().isOk())
                .andExpect(jsonPath("$.items[0].sector").value("SECURITIES"))
                .andExpect(jsonPath("$.items[0].rateType").value("AGREED"))
                .andExpect(jsonPath("$.items[0].maxRate").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.items[0].sourceAsOf").value(org.hamcrest.Matchers.nullValue()))
                .andExpect(jsonPath("$.items[0].result").doesNotExist());
    }
}
