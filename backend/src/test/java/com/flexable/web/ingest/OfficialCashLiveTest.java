package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.web.servlet.MockMvc;
import com.flexable.web.cashcatalog.CashCatalogService;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:cash-live;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
@EnabledIfEnvironmentVariable(named = "CASH_LIVE_CHECK", matches = "true")
class OfficialCashLiveTest {
    @Autowired OfficialCashClient client;
    @Autowired CashCatalogService catalog;
    @Autowired MockMvc mvc;
    @Test void officialPagesArePersistedAndServedFromAnIsolatedTestDatabase() throws Exception {
        var counts = new java.util.HashMap<String, Integer>();
        for (var source : OfficialCashClient.Source.values()) {
            String selected = System.getenv("CASH_LIVE_SOURCES");
            if (selected != null && !java.util.Arrays.asList(selected.split(",")).contains(source.name())) continue;
            var products = client.fetch(source, OffsetDateTime.now(ZoneOffset.ofHours(9)));
            assertThat(products).isNotEmpty();
            assertThat(products.stream().map(p -> p.id()).distinct().count()).isEqualTo(products.size());
            // 공식 화면에서 별도로 확인한 전체 건수와 대조할 때만 지정한다. 미래 건수를 하드코딩하지 않는다.
            if (source == OfficialCashClient.Source.FSB && System.getenv("CASH_FSB_EXPECTED_COUNT") != null)
                assertThat(products).hasSize(Integer.parseInt(System.getenv("CASH_FSB_EXPECTED_COUNT")));
            catalog.publish(source.kind, source.key, "PUBLIC_FACTS; live verification; source=" + source.url, products);
            counts.merge(source.kind, products.size(), Integer::sum);
            var response = mvc.perform(get("/api/v1/" + source.kind + "/products")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.isSample").value(false)).andExpect(jsonPath("$.items.length()").value(counts.get(source.kind)))
                    .andReturn().getResponse();
            // 공개 카탈로그 응답만 선택적으로 내보내 실제 조건의 로컬 화면 검증에 재사용한다.
            String reportDir = System.getenv("CASH_LIVE_REPORT_DIR");
            if (reportDir != null && !reportDir.isBlank()) {
                var dir = java.nio.file.Path.of(reportDir);
                java.nio.file.Files.createDirectories(dir);
                java.nio.file.Files.writeString(dir.resolve(source.kind + ".json"),
                    response.getContentAsString(java.nio.charset.StandardCharsets.UTF_8), java.nio.charset.StandardCharsets.UTF_8);
            }
            products.forEach(p -> System.out.println("LIVE " + p.company() + " / " + p.name()
                + " base=" + p.baseRate() + " max=" + p.maxRate() + " asOf=" + p.sourceAsOf()));
        }
    }
}
