package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.flexable.web.cashcatalog.CashCatalogService;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:kdb-simulation;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@EnabledIfEnvironmentVariable(named = "CASH_SIMULATION_URL", matches = "http://127\\.0\\.0\\.1:[0-9]+/official")
class KdbCashSimulationTest {
    @Autowired CashCatalogService catalog;
    private final String base = System.getenv("CASH_SIMULATION_URL");
    private void mode(String value) throws Exception {
        var response = HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(base + "/_mode?value=" + value)).GET().build(),
            HttpResponse.BodyHandlers.ofString());
        assertThat(response.statusCode()).isEqualTo(200);
    }
    @Test void everyPageAndEveryDetailMustSucceedBeforeReplacingSnapshot() throws Exception {
        var client = new OfficialCashClient(Map.of(OfficialCashClient.Source.KDB,
            new OfficialCashClient.Target(URI.create(base + "/kdb"), URI.create(base + "/robots.txt"))));
        var start = Instant.parse("2026-11-05T01:00:00Z");
        try {
            mode("ok");
            new CashCatalogJob(client, catalog, Clock.fixed(start, ZoneOffset.UTC)).sync();
            var before = catalog.list("parking").items();
            assertThat(before).hasSize(11);
            assertThat(before).allSatisfy(p -> {
                assertThat(p.baseRate()).isEqualByComparingTo("1.23");
                assertThat(p.maxRate()).isNull();
                assertThat(p.conditions()).doesNotContain("99%");
            });
            for (String failure : new String[]{"kdb-partial", "kdb-last-error", "kdb-wrong-rate", "robots"}) {
                start = start.plusSeconds(7 * 3600);
                mode(failure);
                new CashCatalogJob(client, catalog, Clock.fixed(start, ZoneOffset.UTC)).sync();
                assertThat(catalog.list("parking").items()).as(failure).isEqualTo(before);
            }
        } finally { mode("ok"); }
    }
}
