package com.flexable.web.ingest;

import java.time.Clock;
import java.time.LocalDate;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Profile;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;
import com.flexable.web.ingest.fake.FakePracticeData;
import com.flexable.web.ingest.kiwoom.KiwoomInstrumentSource;
import com.flexable.web.ingest.kiwoom.KiwoomTokenClient;
import com.flexable.web.market.*;
import com.flexable.web.market.PracticeMarketData.*;

/** 기존 시세·사건 수집 뒤 신규 기능용 자료를 보충한다. 실패 시 마지막 성공 자료 보존. */
@Component
@Profile("worker")
public class PracticeSyncJob {
    private static final Logger log = LoggerFactory.getLogger(PracticeSyncJob.class);
    private final MarketService market;
    private final EventService events;
    private final PracticeMarketService store;
    private final PriceSource prices;
    private final IngestProperties props;
    private final Clock clock;
    private final InstrumentSource industries;
    public PracticeSyncJob(MarketService market, EventService events, PracticeMarketService store,
            PriceSource prices, IngestProperties props, Clock clock, KiwoomTokenClient tokens) {
        this.market = market; this.events = events; this.store = store; this.prices = prices; this.props = props; this.clock = clock;
        var factory = new org.springframework.http.client.JdkClientHttpRequestFactory();
        factory.setReadTimeout(java.time.Duration.ofSeconds(10));
        this.industries = new KiwoomInstrumentSource(RestClient.builder().requestFactory(factory).build(),
                props.kiwoom().baseUrl(), tokens, clock, IngestConfig.SEOUL);
    }
    public void runOnce() {
        LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
        if ("fake".equals(props.priceSource())) {
            FakePracticeData.create(today).forEach(store::save);
            return;
        }
        for (Board board : List.of(Board.KOSPI, Board.KOSDAQ)) {
            List<InstrumentInfo> listing;
            try { listing = industries.listing(board).items(); }
            catch (RuntimeException e) { log.warn("시뮬레이션 업종 보충 실패: {}", board); continue; }
            var byCode = new HashMap<String, InstrumentInfo>();
            listing.forEach(i -> byCode.put(i.code(), i));
            for (var ranked : market.board(board).items()) {
                var info = byCode.get(ranked.id());
                if (info == null || PracticeMarketService.categoryName(info.industry()).isEmpty()) continue;
                try {
                    var raw = prices.dailyBars(info.code(), today.minusMonths(9), today).stream()
                            .sorted(Comparator.comparing(DailyBar::date)).toList();
                    if (raw.size() < 120) continue;
                    var tail = raw.subList(raw.size() - 120, raw.size());
                    if (tail.stream().anyMatch(b -> b.open() == null || b.high() == null || b.low() == null)) continue;
                    var candles = tail.stream().map(b -> new Candle(b.date().toString(), b.open(), b.high(), b.low(), b.close())).toList();
                    var news = events.eventsBetween(List.of(info.code()), tail.getFirst().date(), today).stream()
                            .filter(e -> info.code().equals(e.code())).flatMap(e -> e.sources().stream())
                            .map(s -> new News(s.externalId(), s.title(), s.date().toString(), s.url(), "금융감독원 DART")).distinct().toList();
                    String industry = PracticeMarketService.categoryName(info.industry());
                    store.save(new Dataset(new PracticeMarketData.Instrument(info.code(), info.name(), PracticeMarketService.categoryCode(industry),
                            industry, "KIWOOM_UPNAME_V1", today.toString()), candles, news, false,
                            List.of(prices.source(), "키움증권 업종 분류", "금융감독원 DART")));
                } catch (RuntimeException e) { log.warn("시뮬레이션 자료 보충 실패: {}", info.code()); }
            }
        }
    }
}
