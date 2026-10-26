package com.flexable.web.ingest;

/** kind: STOCK 또는 ETF. market: KOSPI·KOSDAQ 등(모르면 null). marketCap: 시가총액(원, 모르면 null). */
public record InstrumentInfo(String code, String name, String market, String kind, Long marketCap, String industry) {
    public InstrumentInfo(String code, String name, String market, String kind, Long marketCap) {
        this(code, name, market, kind, marketCap, null);
    }
}
