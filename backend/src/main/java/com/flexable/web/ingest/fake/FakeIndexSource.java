package com.flexable.web.ingest.fake;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import com.flexable.web.ingest.IndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/** 키 없이 쓰는 결정적 시장 띠 값(테스트·오프라인 확인용). 8칸 모두 주고 평일만 거래일로 본다. 실제 지수·시세·환율이 아니다. */
public class FakeIndexSource implements IndexSource {

	/** 칸마다 기준값(×100). 날마다 기준값의 -1.6%~+3% 안에서 움직인다. */
	private static final Map<IndexKey, Long> BASE = Map.of(IndexKey.KOSPI, 260_000L, IndexKey.KOSDAQ, 85_000L, IndexKey.KRXBOND, 19_000L,
			IndexKey.GOLD, 15_000_000L, IndexKey.USDKRW, 138_500L, IndexKey.JPYKRW, 90_000L, IndexKey.EURKRW, 150_000L, IndexKey.CNYKRW, 19_350L);

	@Override
	public String source() {
		return "테스트용 가짜 지수";
	}

	@Override
	public Set<IndexKey> keys() {
		return EnumSet.allOf(IndexKey.class);
	}

	@Override
	public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
		long base = BASE.get(key);
		List<IndexValue> out = new ArrayList<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
				continue;
			}
			long day = d.toEpochDay();
			BigDecimal v = BigDecimal.valueOf(base + base * ((day % 11) * 3 - (day % 5) * 4) / 1000, 2);
			out.add(new IndexValue(d, v.setScale(key.scale(), RoundingMode.DOWN)));
		}
		return out;
	}
}
