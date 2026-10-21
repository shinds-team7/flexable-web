package com.flexable.web.market;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;

class WeeklyClosesTest {

	private static DailyClose d(String date, long close) {
		return new DailyClose(LocalDate.parse(date), close);
	}

	@Test
	void 그_주_마지막_거래일_종가를_고른다() {
		// 2026-10-12(월) 주: 월~금 중 목요일이 마지막 거래일(금 휴장 가정)
		List<DailyClose> closes = List.of(d("2026-10-15", 300), d("2026-10-12", 100), d("2026-10-13", 200));
		List<WeeklyClose> w = WeeklyCloses.of(closes, LocalDate.parse("2026-10-12"), LocalDate.parse("2026-10-12"));
		assertEquals(1, w.size());
		assertEquals(LocalDate.parse("2026-10-15"), w.get(0).lastTradingDate());
		assertEquals(300L, w.get(0).close());
		assertEquals(3, w.get(0).tradingDays());
	}

	@Test
	void 거래일_없는_주는_직전_종가를_이어_쓴다() {
		List<DailyClose> closes = List.of(d("2026-09-25", 500), d("2026-10-08", 700));
		List<WeeklyClose> w = WeeklyCloses.of(closes, LocalDate.parse("2026-09-28"), LocalDate.parse("2026-10-05"));
		assertEquals(2, w.size());
		assertEquals(500L, w.get(0).close());
		assertEquals(0, w.get(0).tradingDays());
		assertEquals(LocalDate.parse("2026-09-25"), w.get(0).lastTradingDate());
		assertEquals(700L, w.get(1).close());
	}

	@Test
	void 연말_연초는_월요일_기준으로_한_주다() {
		// 2025-12-29(월)~2026-01-04(일)
		List<DailyClose> closes = List.of(d("2025-12-30", 10), d("2026-01-02", 20));
		List<WeeklyClose> w = WeeklyCloses.of(closes, LocalDate.parse("2025-12-29"), LocalDate.parse("2025-12-29"));
		assertEquals(LocalDate.parse("2026-01-02"), w.get(0).lastTradingDate());
		assertEquals(20L, w.get(0).close());
	}

	@Test
	void 시세가_시작되기_전_주는_null() {
		List<WeeklyClose> w = WeeklyCloses.of(List.of(d("2026-10-14", 1)), LocalDate.parse("2026-10-05"), LocalDate.parse("2026-10-12"));
		assertNull(w.get(0).close());
		assertEquals(1L, w.get(1).close());
	}
}
