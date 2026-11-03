package com.flexable.web.market;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import com.flexable.web.market.EventDetector.Bar;
import com.flexable.web.market.EventDetector.Stages;
import com.flexable.web.market.EventDetectorBaseline.Contamination;
import com.flexable.web.market.EventDetectorBaseline.Line;
import com.flexable.web.market.EventDetectorBaseline.Null;
import com.flexable.web.market.EventDetectorBaseline.Pins;
import com.flexable.web.market.EventDetectorBaseline.Power;
import com.flexable.web.market.EventDetectorBaseline.YearRow;

/**
 * 사건 탐지기 v1 기준선(합성 데이터, 고정 시드). 결과 표를 System.out에 찍는다.
 * 종목 40개 × 2,750거래일(워밍업 251일을 빼면 약 10만 거래일). 시장 σ 1%, 종목 고유 σ 2%(SyntheticSeries 참고), β 0.6~1.4.
 */
class EventDetectorBaselineTest {

	private static final int LINES = 40;
	private static final int DAYS = 2_750;
	/** 점프 간격. σ 창(60일)보다 길어 앞 점프가 다음 점프의 σ를 키우지 않는다. */
	private static final int JUMP_GAP = 100;

	private static final List<LocalDate> CALENDAR = SyntheticSeries.tradingDays(DAYS);

	private static double beta(int i) {
		return 0.6 + 0.8 * i / (LINES - 1);
	}

	private static List<Line> lines(SyntheticSeries.Market m, Map<Integer, Double> yearVol, Map<String, Map<Integer, Double>> jumps) {
		Map<LocalDate, Long> market = EventDetector.closes(m.bars());
		List<Line> out = new ArrayList<>();
		for (int i = 0; i < LINES; i++) {
			String name = "S" + i;
			out.add(new Line(name, SyntheticSeries.stock(100 + i, m, beta(i), yearVol, jumps.getOrDefault(name, Map.of())), market, false));
		}
		return out;
	}

	/** 종목마다 WARMUP + 20일부터 JUMP_GAP 간격으로 ±kσ. 방향은 고정 시드 난수. */
	private static Map<String, Map<Integer, Double>> jumps(double k) {
		Random rnd = new Random(42);
		Map<String, Map<Integer, Double>> out = new HashMap<>();
		for (int i = 0; i < LINES; i++) {
			Map<Integer, Double> m = new HashMap<>();
			for (int d = EventDetectorBaseline.WARMUP + 20; d < DAYS; d += JUMP_GAP) {
				m.put(d, rnd.nextBoolean() ? k : -k);
			}
			out.put("S" + i, m);
		}
		return out;
	}

	private static Map<String, List<Integer>> days(Map<String, Map<Integer, Double>> jumps) {
		Map<String, List<Integer>> out = new HashMap<>();
		jumps.forEach((k, v) -> out.put(k, List.copyOf(v.keySet())));
		return out;
	}

	@Test
	void 기준선_지표() {
		SyntheticSeries.Market calm = SyntheticSeries.market(1, CALENDAR, Map.of(), Map.of());

		// 1. 귀무: 사건 없는 잡음
		List<Line> noise = lines(calm, Map.of(), Map.of());
		Null n = EventDetectorBaseline.nullCalibration(noise);

		// 2. 주입 검출력: 같은 잡음에 ±kσ 점프
		Map<String, Power> power = new LinkedHashMap<>();
		for (double k : new double[] { 3, 4, 5 }) {
			Map<String, Map<Integer, Double>> j = jumps(k);
			power.put("+" + (int) k + "σ", EventDetectorBaseline.power(lines(calm, Map.of(), j), days(j)));
		}

		// 3. 시장 오염: 시장에 120거래일마다 ±5% 충격, 종목에는 점프 없음(잡힌 종목 사건은 모두 오탐)
		Map<Integer, Double> shocks = new HashMap<>();
		for (int d = EventDetectorBaseline.WARMUP + 30, s = 0; d < DAYS; d += 120, s++) {
			shocks.put(d, s % 2 == 0 ? -0.05 : 0.05);
		}
		SyntheticSeries.Market shocked = SyntheticSeries.market(1, CALENDAR, Map.of(), shocks);
		Contamination c = EventDetectorBaseline.contamination(lines(shocked, Map.of(), Map.of()), shocked.bars());

		// 4. 체제 안정성: 연도마다 흔들림 배수를 바꾼다(시장·종목 고유 모두). 점프는 +4σ를 같은 간격으로
		Map<Integer, Double> yearVol = Map.of(2016, 1.0, 2017, 0.6, 2018, 2.0, 2019, 1.0, 2020, 2.5, 2021, 0.8, 2022, 1.5, 2023, 0.5,
				2024, 2.0, 2025, 1.0);
		SyntheticSeries.Market regimes = SyntheticSeries.market(1, CALENDAR, yearVol, Map.of());
		List<Line> regimeLines = lines(regimes, yearVol, jumps(4));
		List<YearRow> years = EventDetectorBaseline.regime(regimeLines);
		// 5. 핀 위치: 흔들림이 바뀌는 해에 사건이 이어 붙어 여러 날 사건이 생긴다
		Pins pins = EventDetectorBaseline.pins(regimeLines);
		List<YearRow> calmYears = EventDetectorBaseline.regime(noise);

		System.out.println("[사건 탐지기 " + EventDetector.VERSION + " 기준선: 합성]");
		System.out.println(EventDetectorBaseline.table(n, power, c, years, pins));
		System.out.println("체제 비교: 잡음만(흔들림 일정) 잘림 " + EventDetectorBaseline.totalCut(calmYears) + "/"
				+ EventDetectorBaseline.totalCandidates(calmYears));

		// σ를 직전 60일 표본으로 재므로 z는 정규가 아니라 t(59)에 가깝다: 정규 0.27%, t(59) 0.395%.
		// 표본 약 10만이면 표준오차 약 0.02%. 두 값을 모두 포함하고 앞뒤로 4 표준오차(0.08%)를 둔다
		assertThat(n.days()).isGreaterThan(95_000);
		assertThat(n.zRate()).isBetween(0.0019, 0.0047);
		// 규칙 전체(4% 문턱·5일 규칙·합치기 포함)는 귀무에서도 거래일 1% 미만
		assertThat(n.ruleRate()).isLessThan(0.01);

		assertThat(power.get("+5σ").rate()).isGreaterThanOrEqualTo(0.90);
		assertThat(pins.peakOff()).isZero();
		// 3σ·4σ는 기준선이라 크기 순서만 본다
		assertThat(power.get("+3σ").rate()).isLessThanOrEqualTo(power.get("+4σ").rate());
		assertThat(power.get("+4σ").rate()).isLessThanOrEqualTo(power.get("+5σ").rate());
	}

	/**
	 * 같은 4개 지표를 로컬 평가 DB 실데이터로(EventDetectorRealDataTest와 같은 환경 변수). 실데이터에는 진짜 사건이 섞여 있어 1번은 귀무가 아니라
	 * 참고 값이다. 2번은 실제 일봉에 120거래일마다 ±kσ(그날 탐지기가 쓴 σ)를 곱해 넣는다. 핀 위치(peak) 외에는 통과 조건 없이 표만 찍는다.
	 */
	@Test
	@EnabledIfEnvironmentVariable(named = RealData.DB_URL, matches = ".+")
	void 실데이터_기준선_지표() throws Exception {
		RealData.Loaded data = RealData.load();
		Map<LocalDate, Long> market = EventDetector.closes(data.proxy().bars());
		List<Line> real = data.stocks().stream().map(s -> new Line(s.code(), s.bars(), market, s.etf())).toList();

		Map<String, Power> power = new LinkedHashMap<>();
		for (double k : new double[] { 3, 4, 5 }) {
			Random rnd = new Random(42);
			List<Line> injected = new ArrayList<>();
			Map<String, List<Integer>> at = new HashMap<>();
			for (Line l : real) {
				Stages st = EventDetector.stockStages(l.bars(), market, l.etf());
				if (st == null) {
					continue;
				}
				List<Bar> bars = new ArrayList<>(l.bars());
				List<Integer> days = new ArrayList<>();
				for (int d = EventDetectorBaseline.WARMUP + 20; d < bars.size(); d += 120) {
					if (Double.isNaN(st.sigma()[d]) || st.sigma()[d] == 0) {
						continue;
					}
					double f = Math.exp((rnd.nextBoolean() ? k : -k) * st.sigma()[d]);
					for (int i = d; i < bars.size(); i++) {
						Bar b = bars.get(i);
						bars.set(i, new Bar(b.date(), Math.round(b.close() * f), b.volume()));
					}
					days.add(d);
				}
				injected.add(new Line(l.name(), bars, market, l.etf()));
				at.put(l.name(), days);
			}
			power.put("+" + (int) k + "σ", EventDetectorBaseline.power(injected, at));
		}

		System.out.println("[사건 탐지기 " + EventDetector.VERSION + " 기준선: 실데이터 " + real.size() + "종목, 시장 대용 " + data.proxy().code()
				+ " " + data.proxy().bars().getFirst().date() + "~" + data.proxy().bars().getLast().date() + "]");
		Pins pins = EventDetectorBaseline.pins(real);
		System.out.println(EventDetectorBaseline.table(EventDetectorBaseline.nullCalibration(real), power,
				EventDetectorBaseline.contamination(real, data.proxy().bars()), EventDetectorBaseline.regime(real), pins));
		assertThat(pins.peakOff()).isZero();
	}
}
