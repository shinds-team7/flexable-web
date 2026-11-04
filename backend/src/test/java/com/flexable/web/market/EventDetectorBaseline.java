package com.flexable.web.market;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collection;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.TreeMap;

import com.flexable.web.market.EventDetector.Bar;
import com.flexable.web.market.EventDetector.Candidate;
import com.flexable.web.market.EventDetector.Detected;
import com.flexable.web.market.EventDetector.Stages;

/**
 * 사건 탐지기 v1 기준선 지표 4가지와 핀 위치. 탐지기 규칙은 다시 쓰지 않고 EventDetector.stock()·stockStages()의 결과만 센다.
 * 합성 데이터(EventDetectorBaselineTest)와 로컬 실데이터(EventDetectorRealDataTest)가 같이 쓴다.
 * 워밍업(β 250일)은 측정에서 뺀다: WARMUP보다 앞선 날의 z·후보·사건은 세지 않는다.
 */
final class EventDetectorBaseline {

	/** 측정 시작 거래일 번호. σ(40~60일)·β(120~250일) 창이 다 찬 뒤. */
	static final int WARMUP = EventDetector.BETA_WINDOW + 1;

	/** 종목 한 줄. market은 시장 대용 종가(날짜→원). */
	record Line(String name, List<Bar> bars, Map<LocalDate, Long> market, boolean etf) {
	}

	/** 1. 귀무 보정. days는 z를 잰 거래일 수. */
	record Null(long days, long zHits, long candidates) {
		double zRate() {
			return (double) zHits / days;
		}

		double ruleRate() {
			return (double) candidates / days;
		}
	}

	/** 2. 주입 검출력. */
	record Power(int injected, int detected) {
		double rate() {
			return (double) detected / injected;
		}
	}

	/** 3. 시장 오염률. baseDays는 시장이 ±3% 이상 움직인 날의 비율(비교 기준). */
	record Contamination(int events, int overlapping, double baseDays) {
		double rate() {
			return events == 0 ? 0 : (double) overlapping / events;
		}
	}

	/** 4. 체제 안정성: 연도별 후보 수와 상한(연 6건)으로 잘린 수. lineYears는 그 연도에 측정한 종목 수. */
	record YearRow(int year, int lineYears, int candidates, int cut, int maxPerLine) {
		double cutRate() {
			return candidates == 0 ? 0 : (double) cut / candidates;
		}
	}

	/**
	 * 5. 핀 위치. multiDay는 여러 날 사건 수, startOff는 시작일이 기간 중 가장 크게 움직인 날이 아닌 사건(수정 전 핀),
	 * peakOff는 peak가 그날이 아닌 사건(수정 후 핀, 0이어야 한다). inverted는 같은 해에 사건이 덮지 않은 더 크게 움직인 날이 있는 사건(참고).
	 */
	record Pins(int events, int multiDay, int startOff, int peakOff, int inverted) {
	}

	private EventDetectorBaseline() {
	}

	static Null nullCalibration(Collection<Line> lines) {
		long days = 0, hits = 0, cands = 0;
		for (Line l : lines) {
			Stages s = EventDetector.stockStages(l.bars(), l.market(), l.etf());
			if (s == null) {
				continue;
			}
			for (int i = WARMUP; i < s.z().length; i++) {
				if (!Double.isNaN(s.z()[i])) {
					days++;
					hits += Math.abs(s.z()[i]) >= EventDetector.Z_ONE_DAY ? 1 : 0;
				}
			}
			cands += s.merged().stream().filter(c -> c.start() >= WARMUP).count();
		}
		return new Null(days, hits, cands);
	}

	/** jumps: 종목 이름 → 점프를 심은 거래일 번호. 그날을 포함한 최종 사건(상한 적용 후)이 있으면 검출. */
	static Power power(Collection<Line> lines, Map<String, List<Integer>> jumps) {
		int injected = 0, detected = 0;
		for (Line l : lines) {
			List<Detected> found = EventDetector.stock(l.bars(), l.market(), l.etf());
			for (int day : jumps.getOrDefault(l.name(), List.of())) {
				LocalDate d = l.bars().get(day).date();
				injected++;
				detected += found.stream().anyMatch(e -> !d.isBefore(e.start()) && !d.isAfter(e.end())) ? 1 : 0;
			}
		}
		return new Power(injected, detected);
	}

	/** 종목 사건(상한 적용 후) 중 기간 안에 시장 대용 종목이 하루 ±3% 이상 움직인 날이 있는 비율. */
	static Contamination contamination(Collection<Line> lines, List<Bar> proxy) {
		Map<LocalDate, Double> big = new HashMap<>();
		int measured = 0;
		for (int i = Math.max(1, WARMUP); i < proxy.size(); i++) {
			double r = (double) proxy.get(i).close() / proxy.get(i - 1).close() - 1;
			measured++;
			if (Math.abs(r) >= EventDetector.MOVE_MARKET) {
				big.put(proxy.get(i).date(), r);
			}
		}
		LocalDate from = proxy.size() > WARMUP ? proxy.get(WARMUP).date() : LocalDate.MAX;
		int events = 0, overlapping = 0;
		for (Line l : lines) {
			for (Detected e : EventDetector.stock(l.bars(), l.market(), l.etf())) {
				if (e.start().isBefore(from)) {
					continue;
				}
				events++;
				overlapping += big.keySet().stream().anyMatch(d -> !d.isBefore(e.start()) && !d.isAfter(e.end())) ? 1 : 0;
			}
		}
		return new Contamination(events, overlapping, measured == 0 ? 0 : (double) big.size() / measured);
	}

	/** 연도(후보 시작일)별. 워밍업이 걸친 해는 그 종목에서 뺀다(그해 앞부분을 못 봐서 후보가 적게 잡힌다). */
	static List<YearRow> regime(Collection<Line> lines) {
		Map<Integer, int[]> byYear = new TreeMap<>();
		for (Line l : lines) {
			Stages s = EventDetector.stockStages(l.bars(), l.market(), l.etf());
			if (s == null || l.bars().size() <= WARMUP) {
				continue;
			}
			int firstFull = l.bars().get(WARMUP).date().getYear() + 1;
			int lastYear = l.bars().getLast().date().getYear();
			Map<Integer, Integer> count = new HashMap<>();
			for (Candidate c : s.merged()) {
				count.merge(l.bars().get(c.start()).date().getYear(), 1, Integer::sum);
			}
			for (int y = firstFull; y <= lastYear; y++) {
				int c = count.getOrDefault(y, 0);
				int[] row = byYear.computeIfAbsent(y, k -> new int[4]);
				row[0]++;
				row[1] += c;
				row[2] += Math.max(0, c - EventDetector.KEEP_PER_YEAR);
				row[3] = Math.max(row[3], c);
			}
		}
		List<YearRow> out = new ArrayList<>();
		byYear.forEach((y, r) -> out.add(new YearRow(y, r[0], r[1], r[2], r[3])));
		return out;
	}

	/** 하루 등락은 전날 종가 대비. 가장 크게 움직인 날은 같으면 앞선 날(EventDetector.peak와 같은 정의를 따로 센다). */
	static Pins pins(Collection<Line> lines) {
		int events = 0, multi = 0, startOff = 0, peakOff = 0, inverted = 0;
		for (Line l : lines) {
			List<Bar> b = l.bars();
			if (b.size() <= WARMUP) {
				continue;
			}
			LocalDate from = b.get(WARMUP).date();
			Map<LocalDate, Integer> ix = new HashMap<>();
			double[] move = new double[b.size()];
			for (int i = 0; i < b.size(); i++) {
				ix.put(b.get(i).date(), i);
				move[i] = i == 0 ? 0 : Math.abs((double) b.get(i).close() / b.get(i - 1).close() - 1);
			}
			List<Detected> found = EventDetector.stock(b, l.market(), l.etf()).stream().filter(e -> !e.start().isBefore(from)).toList();
			Map<Integer, Double> uncovered = new HashMap<>();
			for (int i = WARMUP; i < b.size(); i++) {
				LocalDate d = b.get(i).date();
				if (found.stream().noneMatch(e -> !d.isBefore(e.start()) && !d.isAfter(e.end()))) {
					uncovered.merge(d.getYear(), move[i], Math::max);
				}
			}
			for (Detected e : found) {
				int s = ix.get(e.start()), t = ix.get(e.end()), best = s;
				for (int i = s; i <= t; i++) {
					best = move[i] > move[best] ? i : best;
				}
				events++;
				multi += t > s ? 1 : 0;
				startOff += best != s ? 1 : 0;
				peakOff += !b.get(best).date().equals(e.peak()) ? 1 : 0;
				inverted += move[best] < uncovered.getOrDefault(e.start().getYear(), 0.0) ? 1 : 0;
			}
		}
		return new Pins(events, multi, startOff, peakOff, inverted);
	}

	static int totalCut(List<YearRow> rows) {
		return rows.stream().mapToInt(YearRow::cut).sum();
	}

	static int totalCandidates(List<YearRow> rows) {
		return rows.stream().mapToInt(YearRow::candidates).sum();
	}

	static String pct(double v) {
		return String.format("%.2f%%", v * 100);
	}

	static String table(Null n, Map<String, Power> power, Contamination c, List<YearRow> years, Pins pins) {
		StringBuilder sb = new StringBuilder();
		sb.append("| 지표 | 값 |\n|---|---|\n");
		sb.append("| 1. 귀무: 하루 \\|z\\|≥3.0 비율 | ").append(pct(n.zRate())).append(" (").append(n.zHits()).append('/').append(n.days())
			.append("거래일, 정규 0.27%·t(59) 0.40%) |\n");
		sb.append("| 1. 귀무: 규칙 전체 발동(합친 후보/거래일) | ").append(pct(n.ruleRate())).append(" (").append(n.candidates()).append("건) |\n");
		power.forEach((k, p) -> sb.append("| 2. 검출력 ").append(k).append(" | ").append(pct(p.rate())).append(" (").append(p.detected())
			.append('/').append(p.injected()).append(") |\n"));
		sb.append("| 3. 시장 오염률(종목 사건 중 시장 ±3% 날과 겹침) | ").append(pct(c.rate())).append(" (").append(c.overlapping()).append('/')
			.append(c.events()).append(", 시장 ±3% 날 비율 ").append(pct(c.baseDays())).append(") |\n");
		sb.append("| 4. 체제: 연 6건 상한으로 잘린 후보 | ").append(pct((double) totalCut(years) / Math.max(1, totalCandidates(years))))
			.append(" (").append(totalCut(years)).append('/').append(totalCandidates(years)).append(") |\n");
		sb.append("| 5. 핀: 여러 날 사건 중 시작일이 가장 크게 움직인 날이 아님(수정 전) | ").append(pct((double) pins.startOff() / Math.max(1, pins.multiDay())))
			.append(" (").append(pins.startOff()).append('/').append(pins.multiDay()).append(") |\n");
		sb.append("| 5. 핀: peak가 가장 크게 움직인 날이 아님(수정 후) | ").append(pins.peakOff()).append('/').append(pins.events()).append(" |\n");
		sb.append("| 5. 역전(참고): 같은 해에 사건이 덮지 않은 더 큰 날이 있는 사건 | ").append(pct((double) pins.inverted() / Math.max(1, pins.events())))
			.append(" (").append(pins.inverted()).append('/').append(pins.events()).append(") |\n");
		sb.append("\n| 연도 | 종목 수 | 후보 | 종목당 평균 | 최대 | 잘림 |\n|---|---|---|---|---|---|\n");
		for (YearRow y : years) {
			sb.append(String.format("| %d | %d | %d | %.1f | %d | %s |%n", y.year(), y.lineYears(), y.candidates(),
					(double) y.candidates() / y.lineYears(), y.maxPerLine(), pct(y.cutRate())));
		}
		return sb.toString();
	}
}
