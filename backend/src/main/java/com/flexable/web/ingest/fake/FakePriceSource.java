package com.flexable.web.ingest.fake;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import com.flexable.web.ingest.DailyBar;
import com.flexable.web.ingest.PriceSource;

/** 키 없이 쓰는 결정적 일봉(테스트·오프라인 확인용). 평일만 거래일로 본다. 실제 시세가 아니다. */
public class FakePriceSource implements PriceSource {

	private static final LocalDate EPOCH = LocalDate.of(2015, 1, 1);

	@Override
	public String source() {
		return "테스트용 가짜 시세";
	}

	@Override
	public List<DailyBar> dailyBars(String code, LocalDate from, LocalDate to) {
		long base = 10_000 + Math.floorMod(code.hashCode(), 90) * 1_000L;
		List<DailyBar> out = new ArrayList<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
				continue;
			}
			long day = d.toEpochDay() - EPOCH.toEpochDay();
			out.add(new DailyBar(d, base + day * 5 + (day % 7) * 40, null));
		}
		return out;
	}
}
