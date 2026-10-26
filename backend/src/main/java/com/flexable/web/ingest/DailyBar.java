package com.flexable.web.ingest;

import java.time.LocalDate;

/** 제공처에서 받은 일봉 한 줄. close는 수정주가 종가(원), volume은 거래량(모르면 null). */
public record DailyBar(LocalDate date, long close, Long volume, Long open, Long high, Long low) {
    public DailyBar(LocalDate date, long close, Long volume) { this(date, close, volume, null, null, null); }
}
