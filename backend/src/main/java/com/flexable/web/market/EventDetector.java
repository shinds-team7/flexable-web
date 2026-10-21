package com.flexable.web.market;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;

/**
 * 급변동 사건 탐지기 v1(03 C-8). 순수 함수라 DB·시계를 모른다.
 * 종목 사건은 시장 영향(β·시장 대용 수익률)을 뺀 초과수익률이 평소보다 얼마나 컸는지(z)로, 시장 사건은 대용 종목의 하루 등락으로 찾는다.
 * 합친 사건은 5거래일을 넘지 않는다. 5일 규칙은 여러 날에 걸친 움직임만 본다(가장 큰 하루를 뺀 나머지 4일 누적도 z ≥ 3.5).
 * 같은 줄에서 3영업일 안 사건은 하나로 합치고, 종목 사건은 연도별 점수 상위 6건만 남긴다(시장 사건은 전부).
 */
final class EventDetector {

	static final String VERSION = "v1-2026-10";

	static final int BETA_WINDOW = 250;
	static final int BETA_MIN = 120;
	static final int SIGMA_WINDOW = 60;
	static final int SIGMA_MIN = 40;
	static final int VOLUME_WINDOW = 20;
	static final int SKIP_FIRST = 20;
	static final double Z_ONE_DAY = 3.0;
	static final double Z_FIVE_DAY = 3.5;
	static final double MOVE_STOCK = 0.04;
	static final double MOVE_ETF = 0.03;
	static final double MOVE_ALWAYS = 0.15;
	static final double MOVE_MARKET = 0.03;
	static final int MERGE_GAP = 3;
	/** 합친 사건의 최대 길이(거래일). 변동이 큰 시기에 사건이 줄줄이 이어 붙어 몇 주짜리가 되지 않게 한다. */
	static final int MAX_WINDOW = 5;
	static final int KEEP_PER_YEAR = 6;

	/** 한 거래일. volume은 모르면 null. */
	record Bar(LocalDate date, long close, Long volume) {
	}

	/** 찾은 사건. marketReturn은 시장 대용 시세가 없으면 null, volumeRatio는 거래량을 모르면 null. */
	record Detected(LocalDate start, LocalDate end, int windowDays, String direction, double returnRate, Double marketReturn,
			double zScore, Double volumeRatio, double score, int rankInYear) {
	}

	private record Candidate(int start, int end, double z, Double vr, double score) {
	}

	private EventDetector() {
	}

	/**
	 * 종목 사건. bars는 날짜 오름차순. market은 시장 대용 종가(날짜→원), 없으면 빈 맵(시장 영향을 빼지 않는다).
	 * etf면 하루 등락 기준을 3%로 낮춘다.
	 */
	static List<Detected> stock(List<Bar> bars, Map<LocalDate, Long> market, boolean etf) {
		int n = bars.size();
		if (n < SIGMA_MIN + 2) {
			return List.of();
		}
		double[] r = new double[n];
		double[] m = new double[n];
		for (int i = 1; i < n; i++) {
			r[i] = Math.log((double) bars.get(i).close() / bars.get(i - 1).close());
			Long mt = market.get(bars.get(i).date());
			Long mp = market.get(bars.get(i - 1).date());
			m[i] = mt == null || mp == null || mp == 0 ? 0 : Math.log((double) mt / mp);
		}
		double[] abn = new double[n];
		double[] sigma = new double[n];
		for (int i = 1; i < n; i++) {
			abn[i] = r[i] - beta(r, m, i) * m[i];
			sigma[i] = stdev(abn, Math.max(1, i - SIGMA_WINDOW), i);
		}
		double move = etf ? MOVE_ETF : MOVE_STOCK;
		boolean[] oneDay = new boolean[n];
		List<Candidate> found = new ArrayList<>();
		for (int i = Math.max(1, SKIP_FIRST); i < n; i++) {
			if (Double.isNaN(sigma[i]) || sigma[i] == 0 || halted(bars, i)) {
				continue;
			}
			double z = abn[i] / sigma[i];
			double ret = Math.expm1(r[i]);
			if ((Math.abs(z) >= Z_ONE_DAY && Math.abs(ret) >= move) || Math.abs(ret) >= MOVE_ALWAYS) {
				oneDay[i] = true;
				Double vr = volumeRatio(bars, i, i);
				found.add(new Candidate(i, i, z, vr, score(z, vr)));
			}
		}
		for (int i = Math.max(5, SKIP_FIRST + 4); i < n; i++) {
			int from = i - 4;
			if (anyTrue(oneDay, from, i) || halted(bars, from) || Double.isNaN(sigma[from]) || sigma[from] == 0) {
				continue;
			}
			double sum = 0;
			double peak = 0;
			for (int j = from; j <= i; j++) {
				sum += abn[j];
				peak = Math.abs(abn[j]) > Math.abs(peak) ? abn[j] : peak;
			}
			// 사건 기간이 섞이지 않게 기간 시작 전 60일의 흔들림으로 잰다
			double z = sum / (sigma[from] * Math.sqrt(5));
			// 하루에 몰린 움직임(1일 기준 4%에 못 미친 날 등)은 1일 규칙으로만 본다: 가장 큰 하루를 빼고도 누적이 커야 여러 날 사건
			double zRest = (sum - peak) / (sigma[from] * 2);
			if (Math.abs(z) >= Z_FIVE_DAY && Math.abs(zRest) >= Z_FIVE_DAY && Math.signum(zRest) == Math.signum(z)) {
				Double vr = volumeRatio(bars, from, i);
				found.add(new Candidate(from, i, z, vr, score(z, vr)));
			}
		}
		return rank(merge(found), bars, market, true);
	}

	/** 시장 사건. bars는 시장 대용 종목(코스피200 추종 ETF 등)의 일봉, 날짜 오름차순. 하루 ±3% 이상인 날. */
	static List<Detected> market(List<Bar> bars) {
		int n = bars.size();
		if (n < 2) {
			return List.of();
		}
		double[] r = new double[n];
		for (int i = 1; i < n; i++) {
			r[i] = Math.log((double) bars.get(i).close() / bars.get(i - 1).close());
		}
		List<Candidate> found = new ArrayList<>();
		for (int i = Math.max(1, SKIP_FIRST); i < n; i++) {
			double ret = Math.expm1(r[i]);
			if (Math.abs(ret) < MOVE_MARKET || halted(bars, i)) {
				continue;
			}
			double sigma = stdev(r, Math.max(1, i - SIGMA_WINDOW), i);
			// 흔들림을 잴 수 없으면 등락률(%)을 점수로 쓴다
			double z = Double.isNaN(sigma) || sigma == 0 ? ret * 100 : r[i] / sigma;
			Double vr = volumeRatio(bars, i, i);
			found.add(new Candidate(i, i, z, vr, score(z, vr)));
		}
		return rank(merge(found), bars, Map.of(), false);
	}

	/** 직전 250영업일(오늘 제외) r~m 회귀 기울기. 표본 120일 미만이거나 시장이 움직이지 않았으면 1. */
	private static double beta(double[] r, double[] m, int i) {
		int from = Math.max(1, i - BETA_WINDOW);
		int k = i - from;
		if (k < BETA_MIN) {
			return 1;
		}
		double mr = 0, mm = 0;
		for (int j = from; j < i; j++) {
			mr += r[j];
			mm += m[j];
		}
		mr /= k;
		mm /= k;
		double cov = 0, var = 0;
		for (int j = from; j < i; j++) {
			cov += (r[j] - mr) * (m[j] - mm);
			var += (m[j] - mm) * (m[j] - mm);
		}
		return var == 0 ? 1 : cov / var;
	}

	/** a[from..to)의 표본 표준편차. 표본이 40개 미만이면 NaN. */
	private static double stdev(double[] a, int from, int to) {
		int k = to - from;
		if (k < SIGMA_MIN) {
			return Double.NaN;
		}
		double mean = 0;
		for (int j = from; j < to; j++) {
			mean += a[j];
		}
		mean /= k;
		double ss = 0;
		for (int j = from; j < to; j++) {
			ss += (a[j] - mean) * (a[j] - mean);
		}
		return Math.sqrt(ss / (k - 1));
	}

	/** 기간 평균 거래량 ÷ 기간 직전 20영업일 거래량 중앙값. 거래량을 모르면 null. */
	private static Double volumeRatio(List<Bar> bars, int from, int to) {
		long[] before = bars.subList(Math.max(0, from - VOLUME_WINDOW), from).stream()
			.map(Bar::volume)
			.filter(v -> v != null && v > 0)
			.mapToLong(Long::longValue)
			.sorted()
			.toArray();
		double sum = 0;
		for (int j = from; j <= to; j++) {
			Long v = bars.get(j).volume();
			if (v == null) {
				return null;
			}
			sum += v;
		}
		if (before.length == 0) {
			return null;
		}
		int h = before.length / 2;
		double median = before.length % 2 == 1 ? before[h] : (before[h - 1] + before[h]) / 2.0;
		return sum / (to - from + 1) / median;
	}

	/** score = |z| × (1 + 0.25 × min(log2(vr), 3)). 거래량을 모르면 |z|. */
	private static double score(double z, Double vr) {
		if (vr == null || vr <= 0) {
			return Math.abs(z);
		}
		return Math.abs(z) * (1 + 0.25 * Math.min(Math.log(vr) / Math.log(2), 3));
	}

	/** 전날 거래량이 0이면 거래정지가 풀린 첫날로 보고 뺀다. */
	private static boolean halted(List<Bar> bars, int i) {
		Long prev = bars.get(i - 1).volume();
		return prev != null && prev == 0;
	}

	private static boolean anyTrue(boolean[] a, int from, int to) {
		for (int j = from; j <= to; j++) {
			if (a[j]) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 3영업일 안에 붙은 사건을 하나로. 기간은 넓히고 z·거래량·점수는 점수가 가장 큰 것을 쓴다.
	 * 합치면 5거래일을 넘을 때: 기간이 겹치면 점수가 큰 쪽만 남기고, 겹치지 않으면 따로 둔다.
	 */
	private static List<Candidate> merge(List<Candidate> found) {
		List<Candidate> sorted = new ArrayList<>(found);
		sorted.sort(Comparator.comparingInt(Candidate::start).thenComparingInt(Candidate::end));
		List<Candidate> out = new ArrayList<>();
		for (Candidate c : sorted) {
			Candidate last = out.isEmpty() ? null : out.getLast();
			if (last != null && c.start() - last.end() <= MERGE_GAP) {
				Candidate top = c.score() > last.score() ? c : last;
				int end = Math.max(last.end(), c.end());
				if (end - last.start() + 1 <= MAX_WINDOW) {
					out.set(out.size() - 1, new Candidate(last.start(), end, top.z(), top.vr(), top.score()));
				}
				else if (c.start() <= last.end()) {
					out.set(out.size() - 1, top);
				}
				else {
					out.add(c);
				}
			}
			else {
				out.add(c);
			}
		}
		return out;
	}

	/** 수익률·방향을 기간으로 다시 계산하고, 연도(시작일)별 점수 순위를 매긴다. capPerYear면 6위까지만. */
	private static List<Detected> rank(List<Candidate> events, List<Bar> bars, Map<LocalDate, Long> market, boolean capPerYear) {
		Map<Integer, List<Candidate>> byYear = new HashMap<>();
		for (Candidate c : events) {
			byYear.computeIfAbsent(bars.get(c.start()).date().getYear(), y -> new ArrayList<>()).add(c);
		}
		List<Detected> out = new ArrayList<>();
		for (List<Candidate> year : byYear.values()) {
			year.sort(Comparator.comparingDouble(Candidate::score).reversed());
			for (int k = 0; k < year.size() && (!capPerYear || k < KEEP_PER_YEAR); k++) {
				out.add(detected(year.get(k), k + 1, bars, market));
			}
		}
		out.sort(Comparator.comparing(Detected::start));
		return out;
	}

	private static Detected detected(Candidate c, int rank, List<Bar> bars, Map<LocalDate, Long> market) {
		Bar before = bars.get(c.start() - 1);
		Bar last = bars.get(c.end());
		double ret = (double) last.close() / before.close() - 1;
		Long mb = market.get(before.date());
		Long ml = market.get(last.date());
		Double mret = mb == null || ml == null || mb == 0 ? null : (double) ml / mb - 1;
		String dir = ret > 0 || (ret == 0 && c.z() > 0) ? "RISE" : "FALL";
		return new Detected(bars.get(c.start()).date(), last.date(), c.end() - c.start() + 1, dir, ret, mret, c.z(), c.vr(), c.score(),
				rank);
	}

	/** 테스트용: 날짜 축을 맞춘 종가 맵. */
	static Map<LocalDate, Long> closes(List<Bar> bars) {
		Map<LocalDate, Long> out = new HashMap<>();
		bars.forEach(b -> out.put(b.date(), b.close()));
		return out;
	}
}
