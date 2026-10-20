package com.flexable.web.market;

import java.time.LocalDate;

/** 한 거래일의 종가(원). */
public record DailyClose(LocalDate date, long close) {
}
