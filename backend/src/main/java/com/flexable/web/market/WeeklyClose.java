package com.flexable.web.market;

import java.time.LocalDate;

/**
 * 한 주(월~일)의 대표 가격 = 그 주 마지막 거래일 종가.
 * 거래일이 없는 주는 tradingDays=0이고 직전 종가를 이어 쓴다. 그 전 시세가 아예 없으면 close·lastTradingDate는 null.
 */
public record WeeklyClose(LocalDate weekStart, LocalDate lastTradingDate, Long close, int tradingDays) {
}
