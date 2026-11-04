package com.flexable.web.ingest;

import java.time.Clock;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.time.ZoneOffset;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import com.flexable.web.cashcatalog.CashCatalogService;

@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "app.ingest.cash", name = "enabled", havingValue = "true")
public class CashCatalogJob {
    private static final Logger log = LoggerFactory.getLogger(CashCatalogJob.class);
    private final OfficialCashClient client;
    private final CashCatalogService catalog;
    private final Clock clock;
    CashCatalogJob(OfficialCashClient client, CashCatalogService catalog, Clock clock) {
        this.client = client; this.catalog = catalog; this.clock = clock;
    }
    @EventListener(ApplicationReadyEvent.class)
    @Scheduled(cron = "0 0 10 * * *", zone = "Asia/Seoul")
    public synchronized void sync() {
        for (var source : client.sources()) {
            if (!catalog.needsRefresh(source.kind, source.key, clock.instant().minus(Duration.ofHours(6)))) continue;
            try {
                var products = client.fetch(source, OffsetDateTime.ofInstant(clock.instant(), ZoneOffset.ofHours(9)));
                catalog.publish(source.kind, source.key,
                    "PUBLIC_FACTS; decision=2026-11-04-official-cash-ingest; source=" + source.url, products);
                log.info("공식 공시 {} 상품 {}개 반영", source.key, products.size());
            } catch (RuntimeException e) {
                log.warn("공식 공시 {} 갱신 실패, 기존 자료 유지: {}", source.key,
                    e instanceof IllegalStateException ? e.getMessage() : e.getClass().getSimpleName());
            }
        }
    }
}
