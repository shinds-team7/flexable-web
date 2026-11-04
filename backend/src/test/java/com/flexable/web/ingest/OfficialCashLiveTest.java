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
        for (var source : OfficialCashClient.Source.values()) {
            var products = client.fetch(source, OffsetDateTime.now(ZoneOffset.ofHours(9)));
            assertThat(products).isNotEmpty();
            catalog.publish(source.kind, source.key, "PUBLIC_FACTS; live verification; source=" + source.url, products);
            mvc.perform(get("/api/v1/" + source.kind + "/products")).andExpect(status().isOk())
                    .andExpect(jsonPath("$.isSample").value(false)).andExpect(jsonPath("$.items").isNotEmpty());
            products.forEach(p -> System.out.println("LIVE " + p.company() + " / " + p.name()
                + " base=" + p.baseRate() + " max=" + p.maxRate() + " asOf=" + p.sourceAsOf()));
        }
    }
}
