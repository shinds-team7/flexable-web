package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collections;
import java.util.Comparator;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;
import com.flexable.web.virtualsim.VirtualSimRuleset.Grade;

/**
 * 룰셋 추출 규칙(policies §8-3·8-6). 외부 호출·DB 없이 입력 값만으로 계산한다(worker가 부른다).
 * 등락·갭·꼬리는 bp 정수이고 나눗셈은 내림(음수는 더 작은 쪽)이다.
 */
public final class VirtualSimRules {

	private VirtualSimRules() {
	}

	public static final String UP = "UP";
	public static final String DOWN = "DOWN";
	public static final String MIXED = "MIXED";
	/**
	 * 유형별 경향(vsim-rules-v3, decisions/2026-11-10-vsim-ruleset-reaction-window 1). 공시 반응 측정 v2에서 반응 창 "근거 있음"(시장 조정, BH q<0.10, 두 기간 재현)인
	 * 유형과 그 방향을 고정한다. 배치고사의 반응 창 근거 유형(VirtualContestQuestions.EVIDENCE_TYPES)과 같은 목록이고, 나머지 유형은 MIXED다.
	 * 룰셋을 만들 때마다 다시 판정하지 않는다. 수집 종목·기간을 바꿔 다시 재면 이 목록을 고치고 룰셋 버전을 올린다
	 */
	public static final Map<VirtualSimCategory, String> TRENDS = Collections.unmodifiableMap(new EnumMap<>(Map.of(
			VirtualSimCategory.SUPPLY_CONTRACT, UP, VirtualSimCategory.BUYBACK_ACQUIRE, UP, VirtualSimCategory.FACILITY, UP)));
	public static final int MIN_PATHS = 30;
	public static final int MAX_PATHS = 500;
	public static final int MIN_TYPES = 3;
	public static final int FOLLOW_DAYS = 5;
	/** 경로 길이: 사건 봉(전날 종가 → 기준 봉 종가) + 1~5번째 후속 거래일 */
	public static final int PATH_DAYS = FOLLOW_DAYS + 1;
	public static final int VOLUME_LOOKBACK = 20;
	public static final int QUANTILES = 1001;
	public static final int GRADES = 3;
	/** 등급마다 필요한 표본 수(종가 등락 r, 갭·꼬리 g/u/d) */
	public static final int MIN_DAILY_SAMPLES = 1000;
	public static final int MIN_OHLC_SAMPLES = 500;

	/** 종목 하나의 일별 종가(날짜 오름차순). volumes는 비어 있으면 null */
	public record Series(String code, List<LocalDate> dates, List<Long> closes, List<Long> volumes) {
	}

	/** 수집한 공시 한 건 */
	public record Filing(String receiptNo, String title, LocalDate date) {
	}

	/** 룰셋 입력. filings에는 5년 목록을 다 받은 종목만 넣는다. ohlc는 practice_datasets의 유효 OHLC 봉 */
	public record Input(List<Series> series, Map<String, List<Filing>> filings, Map<String, List<Candle>> ohlc, List<String> sources) {
	}

	/** r = floor((오늘 종가 − 전날 종가) × 10000 / 전날 종가) */
	public static int returnBp(long prev, long close) {
		return Math.toIntExact(Math.floorDiv(Math.multiplyExact(close - prev, 10000L), prev));
	}

	/** 접수일 당일 봉(휴일이면 직전 거래일) 위치. 첫 봉보다 앞서면 -1 */
	public static int baseIndex(List<LocalDate> dates, LocalDate published) {
		int lo = 0, hi = dates.size() - 1, found = -1;
		while (lo <= hi) {
			int mid = (lo + hi) >>> 1;
			if (!dates.get(mid).isAfter(published)) {
				found = mid;
				lo = mid + 1;
			}
			else {
				hi = mid - 1;
			}
		}
		return found;
	}

	/**
	 * 기준 봉 당일(전날 종가 → 기준 봉 종가)과 1~5번째 후속 거래일의 하루 등락 6개(vsim-rules-v3). 기준 봉 전날 봉이 없거나 후속 5거래일이 없으면 null.
	 * 첫째·둘째 값이 공시 직후(반응 창: 전날 종가 → 다음 거래일 종가)다
	 */
	public static int[] path(List<Long> closes, int base) {
		if (base < 1 || base + FOLLOW_DAYS >= closes.size()) {
			return null;
		}
		int[] out = new int[PATH_DAYS];
		for (int k = 0; k <= FOLLOW_DAYS; k++) {
			out[k] = returnBp(closes.get(base + k - 1), closes.get(base + k));
		}
		return out;
	}

	/** 500개가 넘으면 j = 0..499에 대해 floor(j × n / 500)번째만 남긴다 */
	public static <T> List<T> thin(List<T> paths) {
		int n = paths.size();
		if (n <= MAX_PATHS) {
			return List.copyOf(paths);
		}
		List<T> out = new ArrayList<>(MAX_PATHS);
		for (int j = 0; j < MAX_PATHS; j++) {
			out.add(paths.get((int) ((long) j * n / MAX_PATHS)));
		}
		return out;
	}

	/** floor(m × 10000 / n) / 10000 */
	public static BigDecimal upShare(int n, int up) {
		return BigDecimal.valueOf((long) up * 10000 / n, 4);
	}

	/** 유형의 경향: 고정 목록(TRENDS)에 있으면 그 방향, 없으면 MIXED. 경로 수·상승 비율로 정하지 않는다(v3) */
	public static String trend(VirtualSimCategory category) {
		return TRENDS.getOrDefault(category, MIXED);
	}

	/** 정렬한 값 v(개수 n)에서 q_i = v[floor(i × (n − 1) / 1000)], i = 0..1000 */
	public static int[] quantiles(int[] values) {
		int[] v = values.clone();
		Arrays.sort(v);
		int[] q = new int[QUANTILES];
		for (int i = 0; i < QUANTILES; i++) {
			q[i] = v[(int) ((long) i * (v.length - 1) / (QUANTILES - 1))];
		}
		return q;
	}

	/** 종목별 floor(Σ|r| / 개수) 오름차순(같으면 코드 순) i번째 → floor(i × 3 / 종목 수). 등락이 없는 종목은 빠진다 */
	public static Map<String, Integer> grades(Map<String, int[]> returnsByCode) {
		record Mean(String code, long mean) {
		}
		List<Mean> means = new ArrayList<>();
		returnsByCode.forEach((code, r) -> {
			if (r.length > 0) {
				long sum = 0;
				for (int x : r) {
					sum += Math.abs(x);
				}
				means.add(new Mean(code, sum / r.length));
			}
		});
		means.sort(Comparator.comparingLong(Mean::mean).thenComparing(Mean::code));
		Map<String, Integer> out = new HashMap<>();
		for (int i = 0; i < means.size(); i++) {
			out.put(means.get(i).code(), (int) ((long) i * GRADES / means.size()));
		}
		return out;
	}

	/**
	 * 공시 한 건의 거래량 배수: 후속 5거래일 평균 ÷ 기준일 전 20거래일 평균. 기준일 전 봉이 20개 미만이거나 그 합이 0이거나
	 * 그 20일·후속 5일 중 거래량이 비어 있으면 정할 수 없다(null).
	 */
	static BigDecimal volumeRatio(List<Long> volumes, int base) {
		if (base < VOLUME_LOOKBACK || base + FOLLOW_DAYS >= volumes.size()) {
			return null;
		}
		long before = 0, after = 0;
		for (int i = base - VOLUME_LOOKBACK; i < base; i++) {
			Long v = volumes.get(i);
			if (v == null) {
				return null;
			}
			before += v;
		}
		for (int i = base + 1; i <= base + FOLLOW_DAYS; i++) {
			Long v = volumes.get(i);
			if (v == null) {
				return null;
			}
			after += v;
		}
		if (before == 0) {
			return null;
		}
		return BigDecimal.valueOf(after * VOLUME_LOOKBACK).divide(BigDecimal.valueOf(before * FOLLOW_DAYS), 10, RoundingMode.FLOOR);
	}

	/** 배수 중앙값(개수가 짝수면 가운데 두 값의 평균), 소수 1자리 내림. 값이 없으면 null */
	static BigDecimal median(List<BigDecimal> ratios) {
		if (ratios.isEmpty()) {
			return null;
		}
		List<BigDecimal> v = ratios.stream().sorted().toList();
		int n = v.size();
		BigDecimal m = n % 2 == 1 ? v.get(n / 2) : v.get(n / 2 - 1).add(v.get(n / 2)).divide(BigDecimal.valueOf(2), 10, RoundingMode.FLOOR);
		return m.setScale(1, RoundingMode.FLOOR);
	}

	/** cumulative·sign: 공시 직후(기준 봉 전날 종가 → 다음 거래일 종가)의 등락 bp와 방향(오르면 1, 내리면 -1, 같으면 0. bp로 내림하기 전 원 가격으로 비교) */
	private record Sample(VirtualSimCategory category, String receiptNo, LocalDate date, int[] path, int cumulative, int sign, BigDecimal volumeRatio) {
	}

	/**
	 * 룰셋을 만든다. 쓸 수 있는 유형(경로 30개 이상)이 3개 미만이거나 등급마다 종가 등락 1,000개·갭/꼬리 500개가 안 되면 비어 있다(직전 룰셋을 둔다).
	 * 정정 공시는 경로로 쓰지 않는다(정정일의 움직임은 원래 공시의 반응이 아니다, v3).
	 */
	public static Optional<VirtualSimRuleset> build(Input input) {
		Map<String, int[]> returns = new HashMap<>();
		Map<String, Series> byCode = new HashMap<>();
		for (Series s : input.series()) {
			byCode.put(s.code(), s);
			int[] r = new int[Math.max(0, s.closes().size() - 1)];
			for (int i = 1; i < s.closes().size(); i++) {
				r[i - 1] = returnBp(s.closes().get(i - 1), s.closes().get(i));
			}
			returns.put(s.code(), r);
		}
		Map<String, Integer> grade = grades(returns);

		// 유형별 경로: 분류된 공시(접수번호 중복 제거)를 접수일·접수번호 순으로
		List<Sample> samples = new ArrayList<>();
		List<List<Integer>> daily = new ArrayList<>();
		for (int g = 0; g < GRADES; g++) {
			daily.add(new ArrayList<>());
		}
		Set<String> seen = new HashSet<>();
		LocalDate from = null, to = null;
		for (var e : input.filings().entrySet()) {
			Series s = byCode.get(e.getKey());
			if (s == null || s.dates().isEmpty()) {
				continue;
			}
			from = from == null || s.dates().getFirst().isBefore(from) ? s.dates().getFirst() : from;
			to = to == null || s.dates().getLast().isAfter(to) ? s.dates().getLast() : to;
			Set<Integer> excluded = new HashSet<>();
			for (Filing f : e.getValue()) {
				VirtualSimCategory c = VirtualSimCategory.classify(f.title());
				if (c == null || VirtualContestQuestions.correction(f.title()) || !seen.add(f.receiptNo())) {
					continue;
				}
				int base = baseIndex(s.dates(), f.date());
				if (base < 0) {
					continue;
				}
				for (int k = 0; k <= FOLLOW_DAYS && base + k < s.closes().size(); k++) {
					excluded.add(base + k);
				}
				int[] p = path(s.closes(), base);
				if (p == null) {
					continue;
				}
				long prev = s.closes().get(base - 1), next = s.closes().get(base + 1);
				samples.add(new Sample(c, f.receiptNo(), f.date(), p, returnBp(prev, next), Long.compare(next, prev), volumeRatio(s.volumes(), base)));
			}
			// 평소 하루: 분류된 공시(정정 제외)의 기준 봉과 1~5번째 후속 거래일을 뺀 날
			Integer g = grade.get(s.code());
			if (g != null) {
				int[] r = returns.get(s.code());
				for (int i = 1; i < s.closes().size(); i++) {
					if (!excluded.contains(i)) {
						daily.get(g).add(r[i - 1]);
					}
				}
			}
		}

		Map<VirtualSimCategory, List<Sample>> byCategory = new EnumMap<>(VirtualSimCategory.class);
		samples.stream()
			.sorted(Comparator.comparing(Sample::date).thenComparing(Sample::receiptNo))
			.forEach(x -> byCategory.computeIfAbsent(x.category(), k -> new ArrayList<>()).add(x));
		List<CategoryStats> stats = new ArrayList<>();
		for (var e : byCategory.entrySet()) {
			List<Sample> list = e.getValue();
			int n = list.size();
			if (n < MIN_PATHS) {
				continue;
			}
			int up = (int) list.stream().filter(x -> x.sign() > 0).count();
			int down = (int) list.stream().filter(x -> x.sign() < 0).count();
			int[] cumulative = list.stream().mapToInt(Sample::cumulative).toArray();
			int[] q = quantiles(cumulative);
			stats.add(new CategoryStats(e.getKey(), n, up, down, n - up - down, upShare(n, up), q[500], q[250], q[750],
					median(list.stream().map(Sample::volumeRatio).filter(v -> v != null).toList()), trend(e.getKey()),
					thin(list.stream().map(Sample::path).toList())));
		}
		if (stats.size() < MIN_TYPES) {
			return Optional.empty();
		}

		// 갭·꼬리: practice_datasets 유효 OHLC 봉, 전날 종가 대비
		List<List<int[]>> ohlc = new ArrayList<>();
		for (int g = 0; g < GRADES; g++) {
			ohlc.add(new ArrayList<>());
		}
		input.ohlc().forEach((code, candles) -> {
			Integer g = grade.get(code);
			if (g == null) {
				return;
			}
			for (int i = 1; i < candles.size(); i++) {
				Candle prev = candles.get(i - 1), c = candles.get(i);
				if (!prev.valid() || !c.valid()) {
					continue;
				}
				long p = prev.close();
				ohlc.get(g).add(new int[] { returnBp(p, c.open()), returnBp(p, p + c.high() - Math.max(c.open(), c.close())),
						returnBp(p, p + Math.min(c.open(), c.close()) - c.low()) });
			}
		});
		List<Grade> grades = new ArrayList<>();
		for (int g = 0; g < GRADES; g++) {
			List<int[]> o = ohlc.get(g);
			if (daily.get(g).size() < MIN_DAILY_SAMPLES || o.size() < MIN_OHLC_SAMPLES) {
				return Optional.empty();
			}
			grades.add(new Grade(quantiles(daily.get(g).stream().mapToInt(Integer::intValue).toArray()),
					quantiles(o.stream().mapToInt(x -> x[0]).toArray()), quantiles(o.stream().mapToInt(x -> x[1]).toArray()),
					quantiles(o.stream().mapToInt(x -> x[2]).toArray())));
		}
		return Optional.of(new VirtualSimRuleset(VirtualSimRuleset.VERSION, from == null ? null : from.toString(), to == null ? null : to.toString(),
				false, List.copyOf(input.sources()), List.copyOf(stats), List.copyOf(grades)));
	}
}
