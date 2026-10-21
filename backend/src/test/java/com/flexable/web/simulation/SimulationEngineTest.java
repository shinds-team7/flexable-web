package com.flexable.web.simulation;

import static org.junit.jupiter.api.Assertions.assertEquals;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.flexable.web.market.DailyClose;
import com.flexable.web.simulation.SimulationEngine.Input;
import com.flexable.web.simulation.SimulationEngine.LegInput;
import com.flexable.web.simulation.SimulationEngine.Mode;
import com.flexable.web.simulation.SimulationEngine.Result;

class SimulationEngineTest {

	/** 평일마다 같은 가격. */
	private static List<DailyClose> flat(String from, String to, long price) {
		List<DailyClose> out = new ArrayList<>();
		for (LocalDate d = LocalDate.parse(from); !d.isAfter(LocalDate.parse(to)); d = d.plusDays(1)) {
			if (d.getDayOfWeek().getValue() <= 5) {
				out.add(new DailyClose(d, price));
			}
		}
		return out;
	}

	private static LegInput leg(String id, String w, List<DailyClose> c) {
		return new LegInput(id, new BigDecimal(w), c);
	}

	@Test
	void 한_번에_넣으면_첫_거래일_종가로_사고_주_마지막_종가로_평가한다() {
		List<DailyClose> a = new ArrayList<>(flat("2026-08-01", "2026-09-30", 1000));
		a.add(new DailyClose(LocalDate.parse("2026-10-01"), 1500)); // 목
		a.add(new DailyClose(LocalDate.parse("2026-10-02"), 2000)); // 금, 그 주 마지막 거래일
		Result r = SimulationEngine.run(new Input(LocalDate.parse("2026-08-01"), Mode.LUMP_SUM, 470_000, 0,
				List.of(leg("A", "1", a))));
		assertEquals(1, r.contributionCount());
		assertEquals(470_000, r.totalInvested());
		// 470,000/1,000 = 470주 × 2,000
		assertEquals(940_000, r.finalValue());
		assertEquals(LocalDate.parse("2026-10-02"), r.series().getLast().date());
		assertEquals(new BigDecimal("1.0000"), r.returnRate());
		// 첫 매수일 2026-08-03(월)이 있는 주부터
		assertEquals(LocalDate.parse("2026-08-03"), r.series().getFirst().weekStart());
	}

	@Test
	void 매달_나눠서는_정한_금액을_매달_일정하게_넣는다() {
		List<DailyClose> a = flat("2026-08-01", "2026-10-16", 1000);
		Result r = SimulationEngine.run(new Input(LocalDate.parse("2026-08-01"), Mode.SPLIT, 0, 1_000_000,
				List.of(leg("A", "1", a))));
		assertEquals(3, r.contributionCount());
		assertEquals(1_000_000, r.monthlyAmount());
		assertEquals(3_000_000, r.totalInvested());
		// 달마다 쌓인다: 8월 1,000,000 → 9월 2,000,000 → 10월 3,000,000
		assertEquals(1_000_000, r.series().getFirst().invested());
		assertEquals(3_000_000, r.series().getLast().invested());
		assertEquals(3_000_000, r.finalValue());
		// 이 주에 넣은 돈: 납입 주만 1,000,000, 나머지 0
		assertEquals(3_000_000, r.series().stream().mapToLong(p -> p.contributed()).sum());
		assertEquals(3, r.series().stream().filter(p -> p.contributed() > 0).count());
	}

	@Test
	void 저축_속도는_매달_같은_금액이고_종목_배분_나머지는_첫_종목에() {
		List<DailyClose> a = flat("2026-08-01", "2026-10-16", 3);
		List<DailyClose> b = flat("2026-08-01", "2026-10-16", 7);
		Result r = SimulationEngine.run(new Input(LocalDate.parse("2026-08-01"), Mode.PACE, 0, 78_001,
				List.of(leg("A", "0.5", a), leg("B", "0.5", b))));
		assertEquals(3, r.contributionCount());
		assertEquals(78_001 * 3, r.totalInvested());
		assertEquals(39_001 * 3, r.legs().get(0).invested());
		assertEquals(39_000 * 3, r.legs().get(1).invested());
		// B: 39,000/7 = 5571.42857142(8자리 내림) × 3회 × 7 = 116,999.99... → 116,999
		assertEquals(116_999, r.legs().get(1).finalValue());
	}
}
