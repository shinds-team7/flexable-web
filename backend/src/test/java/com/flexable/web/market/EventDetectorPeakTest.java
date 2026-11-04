package com.flexable.web.market;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.flexable.web.market.EventDetector.Bar;
import com.flexable.web.market.EventDetector.Detected;

/** 사건 핀 날짜(peak): 기간 중 하루 등락 절댓값이 가장 큰 날(decisions/2026-11-03-event-pin-peak-day). */
class EventDetectorPeakTest {

	private static final List<LocalDate> DAYS = SyntheticSeries.tradingDays(400);
	private static final SyntheticSeries.Market MARKET = SyntheticSeries.market(1, DAYS, Map.of(), Map.of());

	private static List<Detected> stock(Map<Integer, Double> jumpsK) {
		List<Bar> bars = SyntheticSeries.stock(100, MARKET, 1.0, Map.of(), jumpsK);
		return EventDetector.stock(bars, EventDetector.closes(MARKET.bars()), false);
	}

	@Test
	void 하루_사건은_시작일() {
		Detected e = stock(Map.of(300, 5.0)).stream().filter(x -> x.start().equals(DAYS.get(300))).findFirst().orElseThrow();
		assertThat(e.windowDays()).isEqualTo(1);
		assertThat(e.peak()).isEqualTo(e.start());
	}

	@Test
	void 합친_사건은_가장_크게_움직인_날() {
		// 300일 +5σ(약 10%), 302일 +9σ(약 18%): 3영업일 안이라 한 사건으로 합쳐지고 핀은 302일
		Detected e = stock(Map.of(300, 5.0, 302, 9.0)).stream().filter(x -> x.start().equals(DAYS.get(300))).findFirst().orElseThrow();
		assertThat(e.end()).isEqualTo(DAYS.get(302));
		assertThat(e.peak()).isEqualTo(DAYS.get(302));
	}

	@Test
	void 시장_사건도_같은_규칙() {
		SyntheticSeries.Market m = SyntheticSeries.market(1, DAYS, Map.of(), Map.of(300, -0.04, 301, -0.09));
		Detected e = EventDetector.market(m.bars()).stream().filter(x -> x.start().equals(DAYS.get(300))).findFirst().orElseThrow();
		assertThat(e.peak()).isEqualTo(DAYS.get(301));
	}
}
