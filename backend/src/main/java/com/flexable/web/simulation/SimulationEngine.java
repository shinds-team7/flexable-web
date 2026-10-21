package com.flexable.web.simulation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

import com.flexable.web.market.DailyClose;
import com.flexable.web.market.WeeklyClose;
import com.flexable.web.market.WeeklyCloses;

/**
 * 과거 시세로 "그때 넣었다면" 금액을 계산한다. 순수 함수(외부 호출·상태 없음).
 * - 납입: 시작 월부터 매달, 그 달 첫 거래일(시작일 이후) 종가로 산다. 모든 종목에 거래일이 있는 달만 센다.
 * - 한 번에(LUMP_SUM) = 첫 달에 totalAmount 전부. 매달 나눠서(SPLIT)·지금 저축 속도로(PACE) = 매달 monthlyAmount를 일정하게.
 * - 금액: 원 단위 정수, 나눗셈은 내림. 종목 배분 나머지는 첫 종목에 붙인다. 수량은 소수 8자리 내림(소수점 매수 가정).
 * - 시계열: 주(월~일)마다 그 주 마지막 거래일 종가로 평가한다.
 */
public final class SimulationEngine {

	public static final String VERSION = "sim-0.1";
	private static final int UNIT_SCALE = 8;

	public enum Mode {
		LUMP_SUM, SPLIT, PACE
	}

	/** closes는 날짜 오름차순. weight 합은 1. */
	public record LegInput(String id, BigDecimal weight, List<DailyClose> closes) {
	}

	public record Input(LocalDate startDate, Mode mode, long totalAmount, long monthlyAmount, List<LegInput> legs) {
	}

	public record LegPoint(String id, Long close, long value, long invested) {
	}

	/** contributed: 이 주에 넣은 돈, profit = total − invested, returnRate = profit ÷ invested(소수 4자리 내림). */
	public record Point(LocalDate weekStart, LocalDate date, int tradingDays, long total, long invested, long contributed,
			long profit, BigDecimal returnRate, List<LegPoint> legs) {
	}

	public record LegResult(String id, long invested, long finalValue) {
	}

	/** purchases: 종목별 매수 기록(날짜순). 사건 전후 내 돈(holdingAt)을 계산할 때 쓴다. */
	public record Result(LocalDate startDate, LocalDate endDate, int contributionCount, long monthlyAmount,
			long totalInvested, long finalValue, long profit, BigDecimal returnRate, List<LegResult> legs,
			List<Point> series, List<List<Buy>> purchases) {
	}

	/** 한 번 산 기록. amount는 원, close는 그날 종가(원). */
	public record Buy(LocalDate date, long amount, long close) {
	}

	/** 어느 날 장 마감 기준 평가액과 그날까지 넣은 돈(원). */
	public record Holding(long value, long invested) {
	}

	private SimulationEngine() {
	}

	public static Result run(Input in) {
		List<LegInput> legs = in.legs();
		LocalDate end = legs.stream()
			.map(l -> l.closes().getLast().date())
			.min(Comparator.naturalOrder())
			.orElseThrow();

		// 1) 납입 달과 종목별 매수일
		List<List<DailyClose>> monthBuys = new ArrayList<>();
		for (YearMonth m = YearMonth.from(in.startDate()); !m.isAfter(YearMonth.from(end)); m = m.plusMonths(1)) {
			LocalDate from = m.atDay(1).isBefore(in.startDate()) ? in.startDate() : m.atDay(1);
			LocalDate to = m.atEndOfMonth().isAfter(end) ? end : m.atEndOfMonth();
			List<DailyClose> perLeg = new ArrayList<>();
			for (LegInput l : legs) {
				l.closes().stream()
					.filter(d -> !d.date().isBefore(from) && !d.date().isAfter(to))
					.findFirst()
					.ifPresent(perLeg::add);
			}
			if (perLeg.size() == legs.size()) {
				monthBuys.add(perLeg);
			}
		}
		if (monthBuys.isEmpty()) {
			throw new IllegalArgumentException("계산할 수 있는 달이 없어요");
		}

		// 2) 회차별 금액
		int n = in.mode() == Mode.LUMP_SUM ? 1 : monthBuys.size();
		long[] amounts = new long[n];
		if (in.mode() == Mode.LUMP_SUM) {
			amounts[0] = in.totalAmount();
		}
		else {
			java.util.Arrays.fill(amounts, in.monthlyAmount());
		}

		// 3) 종목별 매수 목록
		List<List<Buy>> buys = new ArrayList<>();
		legs.forEach(l -> buys.add(new ArrayList<>()));
		for (int k = 0; k < n; k++) {
			long[] alloc = allocate(amounts[k], legs);
			for (int j = 0; j < legs.size(); j++) {
				DailyClose d = monthBuys.get(k).get(j);
				buys.get(j).add(new Buy(d.date(), alloc[j], d.close()));
			}
		}

		// 4) 주 단위 평가
		LocalDate firstBuy = buys.stream().map(b -> b.getFirst().date()).min(Comparator.naturalOrder()).orElseThrow();
		LocalDate firstMonday = WeeklyCloses.mondayOf(firstBuy);
		LocalDate lastMonday = WeeklyCloses.mondayOf(end);
		List<List<WeeklyClose>> weekly = legs.stream()
			.map(l -> WeeklyCloses.of(l.closes().stream().filter(d -> !d.date().isAfter(end)).toList(), firstMonday, lastMonday))
			.toList();
		BigDecimal[] units = new BigDecimal[legs.size()];
		long[] invested = new long[legs.size()];
		int[] next = new int[legs.size()];
		java.util.Arrays.fill(units, BigDecimal.ZERO);
		List<Point> series = new ArrayList<>();
		int weeks = weekly.getFirst().size();
		for (int w = 0; w < weeks; w++) {
			LocalDate weekStart = weekly.getFirst().get(w).weekStart();
			LocalDate weekEnd = weekStart.plusDays(6);
			List<LegPoint> lp = new ArrayList<>();
			long total = 0;
			long inv = 0;
			LocalDate date = null;
			int tradingDays = 0;
			for (int j = 0; j < legs.size(); j++) {
				List<Buy> bj = buys.get(j);
				while (next[j] < bj.size() && !bj.get(next[j]).date().isAfter(weekEnd)) {
					Buy b = bj.get(next[j]++);
					units[j] = units[j].add(BigDecimal.valueOf(b.amount())
						.divide(BigDecimal.valueOf(b.close()), UNIT_SCALE, RoundingMode.DOWN));
					invested[j] += b.amount();
				}
				WeeklyClose wc = weekly.get(j).get(w);
				long value = wc.close() == null ? 0
						: units[j].multiply(BigDecimal.valueOf(wc.close())).setScale(0, RoundingMode.DOWN).longValueExact();
				lp.add(new LegPoint(legs.get(j).id(), wc.close(), value, invested[j]));
				total += value;
				inv += invested[j];
				if (wc.tradingDays() > 0 && (date == null || wc.lastTradingDate().isAfter(date))) {
					date = wc.lastTradingDate();
				}
				tradingDays = Math.max(tradingDays, wc.tradingDays());
			}
			if (date == null) {
				date = weekly.getFirst().get(w).lastTradingDate();
			}
			long prevInv = series.isEmpty() ? 0 : series.getLast().invested();
			series.add(new Point(weekStart, date, tradingDays, total, inv, inv - prevInv, total - inv, rate(total - inv, inv), List.copyOf(lp)));
		}

		Point last = series.getLast();
		long totalInvested = last.invested();
		long profit = last.total() - totalInvested;
		BigDecimal rate = rate(profit, totalInvested);
		List<LegResult> legResults = new ArrayList<>();
		for (int j = 0; j < legs.size(); j++) {
			legResults.add(new LegResult(legs.get(j).id(), invested[j], last.legs().get(j).value()));
		}
		return new Result(in.startDate(), end, n, in.mode() == Mode.LUMP_SUM ? amounts[0] : in.monthlyAmount(),
				totalInvested, last.total(), profit, rate, legResults, series, buys.stream().map(List::copyOf).toList());
	}

	/**
	 * date 장 마감 기준 평가액·넣은 돈(03 C-9). leg가 null이면 모든 종목 합. 그날 거래가 없으면 직전 종가로 평가한다.
	 * 주 단위 시계열과 같은 규칙(수량 소수 8자리 내림, 종목별 평가액 원 단위 내림)을 쓴다.
	 */
	public static Holding holdingAt(Input in, Result r, Integer leg, LocalDate date) {
		long value = 0;
		long invested = 0;
		for (int j = 0; j < in.legs().size(); j++) {
			if (leg != null && leg != j) {
				continue;
			}
			BigDecimal units = BigDecimal.ZERO;
			for (Buy b : r.purchases().get(j)) {
				if (b.date().isAfter(date)) {
					break;
				}
				units = units.add(BigDecimal.valueOf(b.amount()).divide(BigDecimal.valueOf(b.close()), UNIT_SCALE, RoundingMode.DOWN));
				invested += b.amount();
			}
			Long close = null;
			for (DailyClose d : in.legs().get(j).closes()) {
				if (d.date().isAfter(date)) {
					break;
				}
				close = d.close();
			}
			if (close != null) {
				value += units.multiply(BigDecimal.valueOf(close)).setScale(0, RoundingMode.DOWN).longValueExact();
			}
		}
		return new Holding(value, invested);
	}

	static BigDecimal rate(long profit, long invested) {
		return invested == 0 ? BigDecimal.ZERO : BigDecimal.valueOf(profit).divide(BigDecimal.valueOf(invested), 4, RoundingMode.FLOOR);
	}

	/** floor(amount × weight), 나머지는 첫 종목에. */
	static long[] allocate(long amount, List<LegInput> legs) {
		long[] out = new long[legs.size()];
		long sum = 0;
		for (int j = 0; j < legs.size(); j++) {
			out[j] = BigDecimal.valueOf(amount).multiply(legs.get(j).weight()).setScale(0, RoundingMode.DOWN).longValueExact();
			sum += out[j];
		}
		out[0] += amount - sum;
		return out;
	}
}
