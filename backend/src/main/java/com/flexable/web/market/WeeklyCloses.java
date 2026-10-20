package com.flexable.web.market;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.temporal.TemporalAdjusters;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.List;

/** 일봉을 주 단위로 묶는다. 순수 함수. */
public final class WeeklyCloses {

	private WeeklyCloses() {
	}

	public static LocalDate mondayOf(LocalDate d) {
		return d.with(TemporalAdjusters.previousOrSame(DayOfWeek.MONDAY));
	}

	/** firstMonday~lastMonday 주마다 그 주 마지막 거래일 종가. 그 앞의 일봉은 첫 주가 비었을 때 이어 쓰는 데만 쓴다. */
	public static List<WeeklyClose> of(List<DailyClose> closes, LocalDate firstMonday, LocalDate lastMonday) {
		List<DailyClose> asc = closes.stream().sorted(Comparator.comparing(DailyClose::date)).toList();
		List<WeeklyClose> out = new ArrayList<>();
		int i = 0;
		Long prev = null;
		LocalDate prevDate = null;
		for (LocalDate w = mondayOf(firstMonday); !w.isAfter(lastMonday); w = w.plusWeeks(1)) {
			LocalDate end = w.plusDays(6);
			while (i < asc.size() && asc.get(i).date().isBefore(w)) {
				prev = asc.get(i).close();
				prevDate = asc.get(i).date();
				i++;
			}
			DailyClose last = null;
			int n = 0;
			while (i < asc.size() && !asc.get(i).date().isAfter(end)) {
				last = asc.get(i);
				n++;
				i++;
			}
			if (last != null) {
				prev = last.close();
				prevDate = last.date();
				out.add(new WeeklyClose(w, last.date(), last.close(), n));
			}
			else {
				out.add(new WeeklyClose(w, prevDate, prev, 0));
			}
		}
		return out;
	}
}
