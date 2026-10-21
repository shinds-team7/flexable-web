package com.flexable.web.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.within;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.junit.jupiter.api.Test;

import com.flexable.web.market.EventDetector.Bar;
import com.flexable.web.market.EventDetector.Detected;

/** 고정 난수로 만든 시장·종목 시계열(하루 흔들림 시장 0.8%, 종목 고유 0.5%)에 충격을 넣어 탐지 규칙을 본다. */
class EventDetectorTest {

	private static final int N = 300;

	/** 시장(대용 종목)과 종목(β=1) 일봉. shocks는 거래일 번호 → 그날 더할 로그수익률. */
	private record Series(List<Bar> market, List<Bar> stock) {
		LocalDate date(int i) {
			return stock.get(i).date();
		}
	}

	private static Series series(Map<Integer, Double> marketShocks, Map<Integer, Double> stockShocks) {
		Random rnd = new Random(7);
		List<Bar> market = new ArrayList<>();
		List<Bar> stock = new ArrayList<>();
		double m = Math.log(1_000_000), s = Math.log(500_000);
		LocalDate d = LocalDate.of(2024, 1, 1);
		for (int i = 0; i < N; i++) {
			while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
				d = d.plusDays(1);
			}
			if (i > 0) {
				double mr = rnd.nextGaussian() * 0.008 + marketShocks.getOrDefault(i, 0.0);
				m += mr;
				s += mr + rnd.nextGaussian() * 0.005 + stockShocks.getOrDefault(i, 0.0);
			}
			market.add(new Bar(d, Math.round(Math.exp(m)), null));
			stock.add(new Bar(d, Math.round(Math.exp(s)), null));
			d = d.plusDays(1);
		}
		return new Series(market, stock);
	}

	private static List<Detected> stock(Series s) {
		return EventDetector.stock(s.stock(), EventDetector.closes(s.market()), false);
	}

	@Test
	void 잔잔한_시계열에서는_사건이_없다() {
		Series s = series(Map.of(), Map.of());
		assertThat(stock(s)).isEmpty();
		assertThat(EventDetector.market(s.market())).isEmpty();
	}

	@Test
	void 하루_20퍼센트_급등은_상승_사건() {
		Series s = series(Map.of(), Map.of(200, Math.log(1.2)));
		List<Detected> found = stock(s);
		assertThat(found).hasSize(1);
		Detected e = found.getFirst();
		assertThat(e.start()).isEqualTo(s.date(200));
		assertThat(e.end()).isEqualTo(s.date(200));
		assertThat(e.windowDays()).isEqualTo(1);
		assertThat(e.direction()).isEqualTo("RISE");
		assertThat(e.returnRate()).isCloseTo(0.2, within(0.03));
		assertThat(e.marketReturn()).isNotNull();
		assertThat(e.rankInYear()).isEqualTo(1);
	}

	@Test
	void 시장이_조용할_때_6퍼센트_하락은_하락_사건() {
		Series s = series(Map.of(), Map.of(150, Math.log(0.94)));
		List<Detected> found = stock(s);
		assertThat(found).extracting(Detected::start, Detected::direction).containsExactly(org.assertj.core.groups.Tuple.tuple(s.date(150), "FALL"));
		assertThat(found.getFirst().zScore()).isLessThan(-3);
	}

	@Test
	void 시장과_함께_내린_날은_종목_사건이_아니라_시장_사건() {
		Series s = series(Map.of(100, Math.log(0.95)), Map.of());
		assertThat(stock(s)).isEmpty();
		List<Detected> market = EventDetector.market(s.market());
		assertThat(market).hasSize(1);
		assertThat(market.getFirst().start()).isEqualTo(s.date(100));
		assertThat(market.getFirst().direction()).isEqualTo("FALL");
	}

	@Test
	void 사흘_안에_붙은_급등은_하나로_합친다() {
		Series s = series(Map.of(), Map.of(200, Math.log(1.2), 202, Math.log(1.2)));
		List<Detected> found = stock(s);
		assertThat(found).hasSize(1);
		assertThat(found.getFirst().start()).isEqualTo(s.date(200));
		assertThat(found.getFirst().end()).isEqualTo(s.date(202));
		assertThat(found.getFirst().windowDays()).isEqualTo(3);
		assertThat(found.getFirst().returnRate()).isCloseTo(0.44, within(0.05));
	}

	@Test
	void 닷새에_걸쳐_조금씩_오르면_5일_사건() {
		// 하루 +1.2%씩 5일: 하루 기준(4%)에는 안 걸리고 5일 누적 z(≥3.5)에 걸린다
		Map<Integer, Double> shocks = new java.util.HashMap<>();
		for (int i = 180; i < 185; i++) {
			shocks.put(i, 0.012);
		}
		List<Detected> found = stock(series(Map.of(), shocks));
		assertThat(found).hasSize(1);
		assertThat(found.getFirst().windowDays()).isGreaterThanOrEqualTo(5);
		assertThat(found.getFirst().direction()).isEqualTo("RISE");
	}

	@Test
	void 줄줄이_이어진_시장_급락도_한_사건은_5거래일을_넘지_않는다() {
		Map<Integer, Double> shocks = new java.util.HashMap<>();
		for (int i = 0; i < 6; i++) {
			shocks.put(150 + i * 3, Math.log(0.95)); // 사흘마다 −5% 여섯 번
		}
		List<Detected> market = EventDetector.market(series(shocks, Map.of()).market());
		assertThat(market).hasSizeGreaterThan(1);
		assertThat(market).allMatch(e -> e.windowDays() <= EventDetector.MAX_WINDOW);
	}

	@Test
	void 한_해에_사건이_많으면_점수_상위_6건만_남긴다() {
		Map<Integer, Double> shocks = new java.util.HashMap<>();
		for (int i = 0; i < 8; i++) {
			shocks.put(50 + i * 25, Math.log(1.16 + i * 0.01)); // 모두 2024년 안
		}
		List<Detected> found = stock(series(Map.of(), shocks));
		assertThat(found).hasSize(6);
		assertThat(found).extracting(Detected::rankInYear).containsExactlyInAnyOrder(1, 2, 3, 4, 5, 6);
		assertThat(found).allMatch(e -> e.start().getYear() == 2024);
	}

	@Test
	void 하루에_몰린_움직임은_5일_사건으로_잡지_않는다() {
		// 3.5%는 종목 하루 기준(4%) 아래. 그 하루가 5일 누적에 섞여 며칠짜리 사건으로 번지면 안 된다
		assertThat(stock(series(Map.of(), Map.of(200, Math.log(1.035))))).isEmpty();
	}

	@Test
	void ETF는_3퍼센트부터_본다() {
		Series s = series(Map.of(), Map.of(200, Math.log(1.035)));
		assertThat(stock(s)).isEmpty();
		assertThat(EventDetector.stock(s.stock(), EventDetector.closes(s.market()), true)).hasSize(1);
	}
}
