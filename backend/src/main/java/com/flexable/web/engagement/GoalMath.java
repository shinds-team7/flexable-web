package com.flexable.web.engagement;

import java.time.YearMonth;
import java.time.temporal.ChronoUnit;
import java.util.ArrayList;
import java.util.List;

import com.flexable.web.engagement.GoalDtos.Calculation;
import com.flexable.web.engagement.GoalDtos.Checkpoint;
import com.flexable.web.engagement.GoalDtos.Progress;
import com.flexable.web.engagement.GoalDtos.Scenario;

/** 목표 계산은 서버의 원 단위 정수로만 한다. 월·일 필요액은 부족하게 표시하지 않도록 올린다. */
public final class GoalMath {

	private GoalMath() {
	}

	public static Calculation calculate(long amount, long current, Long monthlyPace, YearMonth due, YearMonth now) {
		Long pace = monthlyPace == null || monthlyPace <= 0 ? null : monthlyPace;
		long remaining = Math.max(0, amount - current);
		long monthsLeft = ChronoUnit.MONTHS.between(now, due);
		long calcMonths = Math.max(1, monthsLeft);
		Long expectedMonths = null;
		if (remaining == 0) {
			expectedMonths = 0L;
		}
		else if (pace != null) {
			expectedMonths = ceil(remaining, pace);
		}
		String expectedMonth = expectedMonths == null ? null : now.plusMonths(expectedMonths).toString();
		String status = remaining == 0 ? "REACHED" : monthsLeft < 0 ? "OVERDUE" : pace == null ? "NO_PACE"
				: expectedMonths <= calcMonths ? "ON_TRACK" : "BEHIND";
		Long required = null;
		if ("REACHED".equals(status)) {
			required = 0L;
		}
		else if (!"OVERDUE".equals(status)) {
			required = ceil(remaining, calcMonths * 1000) * 1000;
		}
		long gap = "BEHIND".equals(status) ? required - pace : 0;
		Progress progress = new Progress(now.toString(), current, remaining,
				current >= amount ? 10000 : (int) (current * 10000 / amount), monthsLeft, required, expectedMonths,
				expectedMonth, status, gap, ceil(gap, 3000) * 100);
		if ("REACHED".equals(status)) {
			return new Calculation(progress, List.of(), List.of());
		}
		List<Scenario> scenarios = new ArrayList<>();
		if (pace != null) {
			scenarios.add(new Scenario("KEEP_PACE", pace, expectedMonth));
		}
		boolean overdue = "OVERDUE".equals(status);
		if (!overdue) {
			scenarios.add(new Scenario("MEET_DUE", required, due.toString()));
		}
		scenarios.add(new Scenario("EXTEND_6", ceil(remaining, (overdue ? 6 : calcMonths + 6) * 1000) * 1000,
				(overdue ? now : due).plusMonths(6).toString()));
		List<Checkpoint> checkpoints = new ArrayList<>();
		if (!overdue) {
			for (int percent : new int[] { 25, 50, 75, 100 }) {
				YearMonth month = now.plusMonths(ceil(remaining * percent, required * 100));
				checkpoints.add(new Checkpoint(percent, (month.isAfter(due) ? due : month).toString(),
						current + remaining * percent / 100));
			}
		}
		return new Calculation(progress, List.copyOf(scenarios), List.copyOf(checkpoints));
	}

	private static long ceil(long value, long divisor) {
		return value / divisor + (value % divisor == 0 ? 0 : 1);
	}
}
