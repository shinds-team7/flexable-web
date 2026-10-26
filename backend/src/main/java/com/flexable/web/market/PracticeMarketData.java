package com.flexable.web.market;

import java.util.List;

/** 공개 과거 시장 자료. 사용자 투자금·선택은 포함하지 않는다. */
public final class PracticeMarketData {
    private PracticeMarketData() { }
    public record Candle(String date, long open, long high, long low, long close) {
        public boolean valid() { return low > 0 && low <= Math.min(open, close) && high >= Math.max(open, close); }
    }
    public record News(String id, String title, String publishedDate, String sourceUrl, String sourceName) { }
    public record Instrument(String code, String name, String categoryCode, String categoryName,
                             String classificationVersion, String classificationAsOf) { }
    public record Dataset(Instrument instrument, List<Candle> candles, List<News> news,
                          boolean isSample, List<String> sources) { }
}
