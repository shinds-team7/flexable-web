package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.time.Instant;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;

import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Portfolio;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.practice.PracticeEngine;

/**
 * 가상 시뮬레이션 대회의 계산 규칙(policies §8-8 = tests/policy/virtual-contest.json, decisions/2026-11-05-virtual-sim-contest).
 * 금액은 원 단위 정수, 수익률은 소수 4자리 내림(음수는 더 작은 쪽, §5와 같음). 상태(DB·시각)는 갖지 않는다.
 */
public final class VirtualContestRules {

	private VirtualContestRules() {
	}

	public static final int EVENTS = 4;
	/** 대회 판 구간 길이(거래일, vsim-gen-v2부터 고정. 11-05 구현 PR 사용자 결정) */
	public static final int ROUND_LENGTH = 120;
	public static final int ROUNDS_PER_DAY = 10;
	public static final int PLACEMENT_QUESTIONS = 10;
	public static final int PLACEMENT_MINUTES = 30;
	/** 배치고사 판 기준(결정 기록 2-4, 11-05 구현 PR 사용자 결정): 맞힌 수가 이 값 이상이면 그 판 */
	public static final int CUT_B50M = 7;
	public static final int CUT_B100M = 9;
	public static final long LIQUIDATION_BELOW = 1_000_000L;
	/** 하루 목표: 그날 판들의 초과 수익률 평균(11-05 구현 PR 사용자 결정) */
	public static final BigDecimal DAILY_TARGET = new BigDecimal("0.01");
	public static final int PROMOTE_AT = 4;
	public static final int DEMOTE_AT = -4;
	public static final int RANKING_TOP = 100;
	public static final int RETENTION_MONTHS = 12;
	public static final int WEEK_DAYS = 7;

	/** 맞힌 수 → 시작 판(0~6 B10M, 7~8 B50M, 9~10 B100M) */
	public static VirtualContestBoard placementBoard(int correct) {
		return correct >= CUT_B100M ? VirtualContestBoard.B100M : correct >= CUT_B50M ? VirtualContestBoard.B50M : VirtualContestBoard.B10M;
	}

	/** 배치고사 채점: 그 공시 뒤 5거래일 실제로 올랐으면(up) 오른다, 내렸으면 내린다가 맞음. 고르지 않으면(null) 틀림(11-05 구현 PR 사용자 결정) */
	public static boolean placementCorrect(boolean up, Prediction prediction) {
		return prediction != null && (prediction == Prediction.POSITIVE) == up;
	}

	/** 판의 후보: 공개 가능 유형이 4개 이상이고 먼저 뽑는 뚜렷한 유형·MIXED 유형을 채울 수 있다. trends: 공개 가능 유형마다의 경향 */
	public static boolean candidate(Collection<String> trends, VirtualContestBoard board) {
		long mixed = trends.stream().filter(VirtualSimRules.MIXED::equals).count();
		return trends.size() >= EVENTS && trends.size() - mixed >= board.clear() && mixed >= board.mixed();
	}

	/** (잔액 − 기준) / 기준, 소수 4자리 내림. 판 수익률은 기준 = 지금 판의 대회 시드머니, 한 판 수익률은 기준 = 그 판의 시작 잔액 */
	public static BigDecimal rate(long balance, long base) {
		return PracticeEngine.rate(Math.subtractExact(balance, base), base);
	}

	/**
	 * 한 판의 초과 수익률 = (끝 잔액 − 같은 판을 유지만 했을 때 끝 잔액) / 시작 잔액, 소수 4자리 내림. 가상 움직임의 오름 치우침을 빼고 매매 판단만 본다
	 */
	public static BigDecimal excess(long start, long end, long hold) {
		return PracticeEngine.rate(Math.subtractExact(end, hold), start);
	}

	/**
	 * 하루 수익률 = 그날 판들의 초과 수익률 평균(합 / 판 수, 소수 4자리 내림, 11-05 구현 PR 사용자 결정). 판이 없으면 null.
	 * 판 수가 많아도 복리로 커지거나 오름 치우침으로 평균이 올라가지 않는다
	 */
	public static BigDecimal dayRate(List<BigDecimal> excessRates) {
		if (excessRates.isEmpty()) {
			return null;
		}
		BigDecimal sum = excessRates.stream().reduce(BigDecimal.ZERO, BigDecimal::add);
		return sum.divide(BigDecimal.valueOf(excessRates.size()), 4, java.math.RoundingMode.FLOOR);
	}

	public static boolean liquidated(long balance) {
		return balance < LIQUIDATION_BELOW;
	}

	/** 하루 점수: 목표 이상 +1, 못 미치면 −1, 그날 판이 없으면(null) 0 */
	public static int dailyPoints(BigDecimal dayRate) {
		return dayRate == null ? 0 : dayRate.compareTo(DAILY_TARGET) >= 0 ? 1 : -1;
	}

	/** 주간 판정: +4 이상 한 단계 승급, −4 이하 한 단계 강등(끝 판은 그대로) */
	public static VirtualContestBoard weekly(VirtualContestBoard board, int weekPoints) {
		return weekPoints >= PROMOTE_AT ? board.up() : weekPoints <= DEMOTE_AT ? board.down() : board;
	}

	/** 대회 이름 YYYY-MM */
	public static String contestId(YearMonth month) {
		return month.toString();
	}

	/** 주 구간 [시작일, 끝일]: 1~7일, 8~14일, 15~21일, 22~28일, 29일~말일(있으면) */
	public static List<LocalDate[]> weeks(YearMonth month) {
		List<LocalDate[]> out = new ArrayList<>();
		for (int w = 0; w < 4; w++) {
			out.add(new LocalDate[] { month.atDay(WEEK_DAYS * w + 1), month.atDay(WEEK_DAYS * w + WEEK_DAYS) });
		}
		if (month.lengthOfMonth() > WEEK_DAYS * 4) {
			out.add(new LocalDate[] { month.atDay(WEEK_DAYS * 4 + 1), month.atEndOfMonth() });
		}
		return out;
	}

	/** 날짜가 든 주(1부터) */
	public static int weekOf(LocalDate day) {
		return Math.min((day.getDayOfMonth() - 1) / WEEK_DAYS, 4) + 1;
	}

	/** 그 주의 마지막 날 */
	public static LocalDate weekEnd(LocalDate day) {
		return weeks(YearMonth.from(day)).get(weekOf(day) - 1)[1];
	}

	/** 제출한 매매 하나. 체결은 사건 봉 다음 봉 시가 */
	public record Order(Action action, long quantity) {
	}

	/**
	 * 판 하나를 끝까지 돌린 결과(결정 기록 3·5). 첫 봉 시가에 잔액의 50% 최초 매수(§5), fills의 봉 번호(체결 봉) 시가에 요청 수량을 체결(8-7, 부분 체결),
	 * 고르지 않은 사건은 유지. 마지막 봉 종가로 평가한 총자산이 새 잔액이다.
	 */
	public static Portfolio play(List<Candle> candles, long initial, Map<Integer, Order> fills) {
		var holding = PracticeEngine.trade(new PracticeEngine.Holding(initial, 0), Action.BUY, 50, candles.getFirst().open()).holding();
		for (int i = 1; i < candles.size(); i++) {
			Order o = fills.get(i);
			if (o != null) {
				holding = VirtualSimService.trade(holding, o.action(), o.quantity(), candles.get(i).open()).holding();
			}
		}
		return PracticeEngine.value(holding, candles.getLast().close(), initial);
	}

	/**
	 * 랭킹 한 줄의 정렬 값. excessRate: 지금 판에서 끝낸 판들의 평균 초과 수익률(판이 없으면 0), reachedAt: 마지막으로 잔액이 바뀐 시각(판이 없으면 참가 시각),
	 * userId: 웹 회원 번호(정렬에만)
	 */
	public record Standing(long userId, int points, BigDecimal excessRate, Instant reachedAt, Instant joinedAt) {
	}

	/** 판 점수 큰 순 → 평균 초과 수익률 큰 순 → 그 값에 먼저 도달 → 먼저 참가 → 회원 번호 작은 순(11-05 구현 PR 사용자 결정). 같은 순위 번호는 없다 */
	public static final Comparator<Standing> ORDER = Comparator.comparingInt(Standing::points).reversed()
		.thenComparing(Standing::excessRate, Comparator.reverseOrder())
		.thenComparing(Standing::reachedAt)
		.thenComparing(Standing::joinedAt)
		.thenComparingLong(Standing::userId);
}
