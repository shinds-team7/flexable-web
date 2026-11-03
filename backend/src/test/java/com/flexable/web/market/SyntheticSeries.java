package com.flexable.web.market;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import com.flexable.web.market.EventDetector.Bar;

/**
 * 탐지기 평가용 합성 일봉(고정 시드, 평일만). 시장 계열을 먼저 만들고, 종목은 β × 시장 + 고유 잡음 + 심은 점프로 만든다.
 * 하루 흔들림은 연도별 배수(yearVol)로 바꿀 수 있다(체제 안정성 측정용). 거래량은 넣지 않는다(점수 = |z|).
 *
 * 종목 고유 σ는 기본 2%로 둔다. 1일 규칙은 |z| ≥ 3과 함께 하루 등락 4%(ETF 3%)도 넘어야 해서, σ가 1%면 3σ 점프(3%)가
 * 등락 문턱에 걸려 z와 상관없이 놓친다. 2%면 3σ = 6%라 z 기준만 보게 된다.
 */
final class SyntheticSeries {

	static final LocalDate START = LocalDate.of(2015, 1, 1);
	static final double MARKET_SIGMA = 0.01;
	static final double IDIO_SIGMA = 0.02;

	/** 시장 대용 일봉과 그 로그수익률(r[0] = 0). */
	record Market(List<Bar> bars, double[] logReturns) {
	}

	private SyntheticSeries() {
	}

	/** START부터 평일 n개. */
	static List<LocalDate> tradingDays(int n) {
		List<LocalDate> out = new ArrayList<>(n);
		LocalDate d = START;
		while (out.size() < n) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				out.add(d);
			}
			d = d.plusDays(1);
		}
		return out;
	}

	/** jumps: 거래일 번호 → 그날 더할 단순수익률(예: -0.08). yearVol: 연도 → σ 배수(없으면 1). */
	static Market market(long seed, List<LocalDate> days, Map<Integer, Double> yearVol, Map<Integer, Double> jumps) {
		Random rnd = new Random(seed);
		int n = days.size();
		double[] r = new double[n];
		List<Bar> bars = new ArrayList<>(n);
		double p = Math.log(1_000_000);
		for (int i = 0; i < n; i++) {
			if (i > 0) {
				double vol = MARKET_SIGMA * yearVol.getOrDefault(days.get(i).getYear(), 1.0);
				r[i] = rnd.nextGaussian() * vol + (jumps.containsKey(i) ? Math.log1p(jumps.get(i)) : 0);
				p += r[i];
			}
			bars.add(new Bar(days.get(i), Math.round(Math.exp(p)), null));
		}
		return new Market(bars, r);
	}

	/**
	 * 종목 일봉. jumpsK: 거래일 번호 → 고유 σ의 몇 배를 그날 더할지(부호 = 방향). 점프는 그날의 실제 고유 σ(연도 배수 포함) 기준이다.
	 */
	static List<Bar> stock(long seed, Market m, double beta, Map<Integer, Double> yearVol, Map<Integer, Double> jumpsK) {
		Random rnd = new Random(seed);
		int n = m.bars().size();
		List<Bar> bars = new ArrayList<>(n);
		double p = Math.log(50_000);
		for (int i = 0; i < n; i++) {
			LocalDate d = m.bars().get(i).date();
			if (i > 0) {
				double sigma = idioSigma(d, yearVol);
				p += beta * m.logReturns()[i] + rnd.nextGaussian() * sigma + jumpsK.getOrDefault(i, 0.0) * sigma;
			}
			bars.add(new Bar(d, Math.round(Math.exp(p)), null));
		}
		return bars;
	}

	static double idioSigma(LocalDate d, Map<Integer, Double> yearVol) {
		return IDIO_SIGMA * yearVol.getOrDefault(d.getYear(), 1.0);
	}
}
