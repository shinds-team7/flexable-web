package com.flexable.web.virtualsim;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.Year;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.Collection;
import java.util.Collections;
import java.util.List;
import java.util.SplittableRandom;

import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.market.PracticeWindow;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;
import com.flexable.web.virtualsim.VirtualSimRuleset.Grade;

/**
 * 가상 시세 생성(policies §8-1·8-2·8-4, decisions/2026-11-04-virtual-simulation 2·3). 시드의 결정적 난수(SplittableRandom)로
 * 아래 순서대로 뽑으므로 같은 시드·룰셋·가상 종목(유형 목록)·세션 시작일이면 같은 구간·사건 위치·OHLC가 나온다.
 * 순서: 시작일 → 길이 L → 문제 수 N → 뚜렷한 유형 2개 → 나머지 유형 → 순서 섞기 → 위치 y → 사건마다 경로·제목 → 시작가 → 등급 → 봉마다 g·r·u·d.
 */
public final class VirtualSimGenerator {

	private VirtualSimGenerator() {
	}

	public static final int YEAR_OFFSET = 10;
	public static final int MIN_QUESTIONS = PracticeWindow.MIN_QUESTIONS;
	public static final int MAX_QUESTIONS = 5;
	public static final int CLEAR_QUESTIONS = 2;
	public static final long MIN_START_PRICE = 5_000;
	public static final long MAX_START_PRICE = 200_000;
	public static final long PRICE_STEP = 100;
	public static final long LIMIT_BP = 3_000;

	/** 사건 하나. index는 0부터 센 봉 번호(그 봉 종가 뒤에 보인다), path는 그 유형에서 뽑은 1~5번째 후속 거래일 등락 */
	public record Planned(int index, VirtualSimCategory category, String title, int[] path) {
	}

	public record Plan(List<Candle> candles, List<Planned> events) {
	}

	/** 기준 연도 = 세션 시작일(KST) 연도 + 10 */
	public static int baseYear(LocalDate sessionDate) {
		return sessionDate.getYear() + YEAR_OFFSET;
	}

	/** 토·일요일이면 다음 월요일. 미룬 날이 다음 해면 null(다시 뽑는다) */
	public static LocalDate startDate(LocalDate drawn) {
		LocalDate d = drawn;
		while (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
			d = d.plusDays(1);
		}
		return d.getYear() == drawn.getYear() ? d : null;
	}

	/** 시작일부터 평일만 센 length개 날짜 */
	public static List<LocalDate> tradingDays(LocalDate start, int length) {
		List<LocalDate> out = new ArrayList<>(length);
		for (LocalDate d = start; out.size() < length; d = d.plusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				out.add(d);
			}
		}
		return out;
	}

	/** 여유 S = (L − 6) − 14 − 6 × (N − 1) */
	public static int slack(int length, int questions) {
		int gap = PracticeWindow.FOLLOW_DAYS + 1;
		return (length - gap) - PracticeWindow.LEAD_DAYS - gap * (questions - 1);
	}

	/** 0..S에서 뽑은 y를 오름차순으로 두고 q_k = 14 + 6 × (k − 1) + y_k */
	public static int[] layout(int[] draws) {
		int[] y = draws.clone();
		Arrays.sort(y);
		int[] q = new int[y.length];
		for (int k = 0; k < y.length; k++) {
			q[k] = PracticeWindow.LEAD_DAYS + (PracticeWindow.FOLLOW_DAYS + 1) * k + y[k];
		}
		return q;
	}

	/** 전날 종가 P와 뽑은 r·g·u·d로 봉 하나(±30% 제한, 원 단위 내림) */
	public static Candle bar(String date, long prev, int r, int g, int u, int d) {
		long upper = Math.floorDiv(prev * (10_000 + LIMIT_BP), 10_000L);
		long lower = Math.max(1, ceilDiv(prev * (10_000 - LIMIT_BP), 10_000L));
		long close = clamp(Math.floorDiv(prev * (10_000L + r), 10_000L), lower, upper);
		long open = clamp(Math.floorDiv(prev * (10_000L + g), 10_000L), lower, upper);
		long top = Math.max(open, close), bottom = Math.min(open, close);
		long high = clamp(top + Math.floorDiv(prev * u, 10_000L), top, upper);
		long low = clamp(bottom - Math.floorDiv(prev * d, 10_000L), lower, bottom);
		return new Candle(date, open, high, low, close);
	}

	private static long ceilDiv(long a, long b) {
		return -Math.floorDiv(-a, b);
	}

	private static long clamp(long v, long lo, long hi) {
		return Math.max(lo, Math.min(hi, v));
	}

	/**
	 * 가상 종목 하나의 구간을 만든다. available: 그 회사의 공개 가능한 사건 유형(룰셋에 있는 것만). 3개 이상이고 그중 뚜렷한 유형이 2개 이상이어야 한다.
	 */
	public static Plan generate(long seed, VirtualSimRuleset rules, Collection<VirtualSimCategory> available, LocalDate sessionDate) {
		List<VirtualSimCategory> usable = Arrays.stream(VirtualSimCategory.values())
			.filter(available::contains)
			.filter(c -> rules.stats(c).isPresent())
			.toList();
		List<VirtualSimCategory> clear = usable.stream().filter(c -> rules.stats(c).orElseThrow().clear()).toList();
		if (usable.size() < MIN_QUESTIONS || clear.size() < CLEAR_QUESTIONS) {
			throw new IllegalArgumentException("공개 가능한 사건 유형이 모자라요");
		}
		SplittableRandom rnd = new SplittableRandom(seed);
		int year = baseYear(sessionDate);
		LocalDate start;
		do {
			start = startDate(LocalDate.ofYearDay(year, rnd.nextInt(Year.of(year).length()) + 1));
		}
		while (start == null);
		int length = PracticeWindow.MIN_LENGTH + rnd.nextInt(PracticeWindow.MAX_LENGTH - PracticeWindow.MIN_LENGTH + 1);
		int n = Math.min(MIN_QUESTIONS + rnd.nextInt(MAX_QUESTIONS - MIN_QUESTIONS + 1), usable.size());

		// 뚜렷한 유형에서 2개를 먼저, 나머지는 남은 유형 전체(반반 포함)에서. 뽑은 유형은 위치에 섞어 놓는다
		List<VirtualSimCategory> pool = new ArrayList<>(clear);
		List<VirtualSimCategory> chosen = new ArrayList<>();
		for (int k = 0; k < CLEAR_QUESTIONS; k++) {
			chosen.add(pool.remove(rnd.nextInt(pool.size())));
		}
		pool = new ArrayList<>(usable);
		pool.removeAll(chosen);
		while (chosen.size() < n) {
			chosen.add(pool.remove(rnd.nextInt(pool.size())));
		}
		for (int i = chosen.size() - 1; i > 0; i--) {
			Collections.swap(chosen, i, rnd.nextInt(i + 1));
		}

		int s = slack(length, n);
		int[] draws = new int[n];
		for (int k = 0; k < n; k++) {
			draws[k] = rnd.nextInt(s + 1);
		}
		int[] at = layout(draws);
		List<Planned> events = new ArrayList<>();
		for (int k = 0; k < n; k++) {
			VirtualSimCategory c = chosen.get(k);
			CategoryStats stats = rules.stats(c).orElseThrow();
			int[] path = stats.samples().get(rnd.nextInt(stats.samples().size()));
			String title = c.titles().get(rnd.nextInt(c.titles().size()));
			events.add(new Planned(at[k], c, title, path.clone()));
		}

		long price = MIN_START_PRICE + PRICE_STEP * rnd.nextInt((int) ((MAX_START_PRICE - MIN_START_PRICE) / PRICE_STEP) + 1);
		Grade grade = rules.grades().get(rnd.nextInt(rules.grades().size()));
		List<LocalDate> dates = tradingDays(start, length);
		int[] follow = new int[length];
		Arrays.fill(follow, -1);
		int[][] eventPath = new int[length][];
		for (Planned e : events) {
			for (int k = 1; k <= PracticeWindow.FOLLOW_DAYS; k++) {
				follow[e.index() + k] = k - 1;
				eventPath[e.index() + k] = e.path();
			}
		}
		List<Candle> candles = new ArrayList<>(length);
		for (int i = 0; i < length; i++) {
			int g = grade.g()[rnd.nextInt(grade.g().length)];
			int r = follow[i] >= 0 ? eventPath[i][follow[i]] : grade.r()[rnd.nextInt(grade.r().length)];
			int u = Math.max(0, grade.u()[rnd.nextInt(grade.u().length)]);
			int d = Math.max(0, grade.d()[rnd.nextInt(grade.d().length)]);
			Candle c = bar(dates.get(i).toString(), price, r, g, u, d);
			candles.add(c);
			price = c.close();
		}
		return new Plan(List.copyOf(candles), List.copyOf(events));
	}
}
