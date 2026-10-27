package com.flexable.web.ingest.fake;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Set;

import com.flexable.web.ingest.IndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/** 키 없이 쓰는 결정적 지수(테스트·오프라인 확인용). 평일만 거래일로 본다. 실제 지수가 아니다. */
public class FakeIndexSource implements IndexSource {

	@Override
	public String source() {
		return "테스트용 가짜 지수";
	}

	@Override
	public Set<IndexKey> keys() {
		return Set.of(IndexKey.KOSPI, IndexKey.KOSDAQ);
	}

	@Override
	public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
		long base = key == IndexKey.KOSPI ? 260_000 : 85_000; // ×100
		List<IndexValue> out = new ArrayList<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
				continue;
			}
			long day = d.toEpochDay();
			out.add(new IndexValue(d, BigDecimal.valueOf(base + (day % 11) * 731 - (day % 5) * 977, 2)));
		}
		return out;
	}
}
