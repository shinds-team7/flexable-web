package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.*;
import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.time.Clock;
import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import java.util.Map;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import com.flexable.web.cashcatalog.CashCatalogService;

@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:cash-simulation;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@EnabledIfEnvironmentVariable(named = "CASH_SIMULATION_URL", matches = "http://127\\.0\\.0\\.1:[0-9]+/official")
class OfficialCashSimulationTest {
    @Autowired CashCatalogService catalog;
    private final String base = System.getenv("CASH_SIMULATION_URL");
    private String control(String path) throws Exception {
        return HttpClient.newHttpClient().send(HttpRequest.newBuilder(URI.create(base + path)).GET().build(),
            HttpResponse.BodyHandlers.ofString()).body();
    }
    @Test void actualHttpFailuresAndRobotsDoNotErasePublishedData() throws Exception {
        OfficialCashClient client = new OfficialCashClient(Map.of(
            OfficialCashClient.Source.KBANK, new OfficialCashClient.Target(URI.create(base + "/kbank"), URI.create(base + "/robots.txt")),
            OfficialCashClient.Source.EUGENE, new OfficialCashClient.Target(URI.create(base + "/eugene"), URI.create(base + "/robots.txt"))));
        Instant start = Instant.parse("2026-11-04T00:00:00Z");
        control("/_mode?value=ok");
        new CashCatalogJob(client, catalog, Clock.fixed(start, ZoneOffset.UTC)).sync();
        var parking = catalog.list("parking").items();
        var cma = catalog.list("cma").items();
        assertThat(parking).hasSize(1); assertThat(cma).hasSize(2);
        // 재시작/반복 실행은 6시간 내 실제 페이지를 다시 읽지 않는다.
        String count = control("/_pages");
        new CashCatalogJob(client, catalog, Clock.fixed(start, ZoneOffset.UTC)).sync();
        assertThat(control("/_pages")).isEqualTo(count);
        for (String mode : new String[]{"kbank-error", "malformed"}) {
            start = start.plusSeconds(7 * 3600);
            control("/_mode?value=" + mode);
            new CashCatalogJob(client, catalog, Clock.fixed(start, ZoneOffset.UTC)).sync();
            assertThat(catalog.list("parking").items()).isEqualTo(parking);
            assertThat(catalog.list("cma").items().getFirst().verifiedAt().toInstant()).isEqualTo(start);
        }
        var before = catalog.list("cma").items();
        control("/_mode?value=robots"); count = control("/_pages");
        new CashCatalogJob(client, catalog, Clock.fixed(start.plusSeconds(7 * 3600), ZoneOffset.UTC)).sync();
        assertThat(control("/_pages")).isEqualTo(count); // robots 차단 뒤 상품 HTTP 요청 없음
        assertThat(catalog.list("parking").items()).isEqualTo(parking);
        assertThat(catalog.list("cma").items()).isEqualTo(before);
        for (String mode : new String[]{"redirect", "oversize"}) {
            control("/_mode?value=" + mode);
            assertThatThrownBy(() -> client.fetch(OfficialCashClient.Source.KBANK,
                OffsetDateTime.parse("2026-11-04T10:00:00+09:00"))).isInstanceOf(IllegalStateException.class);
            assertThat(catalog.list("parking").items()).isEqualTo(parking);
        }
        control("/_mode?value=ok");
        // 전체 다운로드 폼 POST 및 EUC-KR 응답을 실제 HTTP로 검증한다.
        var expanded = new OfficialCashClient(Map.of(
            OfficialCashClient.Source.FSB, new OfficialCashClient.Target(URI.create(base + "/fsb"), URI.create(base + "/robots.txt")),
            OfficialCashClient.Source.MIRAE_RP, new OfficialCashClient.Target(URI.create(base + "/mirae"), URI.create(base + "/robots.txt"))));
        var at = OffsetDateTime.parse("2026-11-04T10:00:00+09:00");
        var fsb = expanded.fetch(OfficialCashClient.Source.FSB, at);
        assertThat(fsb).hasSize(2);
        assertThat(expanded.fetch(OfficialCashClient.Source.MIRAE_RP, at).getFirst().baseRate()).isEqualByComparingTo("1.23");
        catalog.publish("parking", OfficialCashClient.Source.FSB.key, "synthetic export", fsb);
        var allBefore = catalog.list("parking").items();
        control("/_mode?value=malformed");
        new CashCatalogJob(expanded, catalog, Clock.fixed(start.plusSeconds(7 * 3600), ZoneOffset.UTC)).sync();
        assertThat(catalog.list("parking").items()).isEqualTo(allBefore);
        control("/_mode?value=ok");
    }
}
