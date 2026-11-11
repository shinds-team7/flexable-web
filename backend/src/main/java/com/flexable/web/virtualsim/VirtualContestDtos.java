package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.virtualsim.VirtualSimDtos.Snapshot;

/** 가상 시뮬레이션 대회 요청·응답(docs/contracts/web-api.yaml VirtualContest*). 금액·수익률·점수는 모두 서버 계산 */
public final class VirtualContestDtos {

	private VirtualContestDtos() {
	}

	// ───────── 대회 안내 ─────────

	public record Week(int week, String startsOn, String endsOn) {
	}

	public record BoardInfo(VirtualContestBoard board, long seedMoney, List<Integer> volatilityGrades, int participants, boolean available) {
	}

	public record Cuts(int B50M, int B100M) {
	}

	public record Rules(int roundsPerDay, int roundsForDailyScore, int eventsPerRound, BigDecimal dailyTargetRate, int weeklyPromoteAt, int weeklyDemoteAt, int placementQuestions,
			Cuts placementCuts, long liquidationBelow, int rankingTop) {
	}

	public record Contest(String contestId, String startsAt, String endsAt, List<Week> weeks, List<BoardInfo> boards, Rules rules) {
	}

	// ───────── 배치고사 ─────────

	/**
	 * 배치고사 문제(실제 과거 공시). 회사명·날짜는 결과에서 공개한다. body: 실제 공시는 null(본문을 저장하지 않음), 예시 자료는 예시 글.
	 * details: 공시 주요 내용(비율·규모 구간, 최대 4개). 구조화 자료가 없는 유형이거나 받지 못했으면 null.
	 * summary: 공시 AI 요약(PlacementSummaries 검사를 통과한 2~5문장, 이름·날짜·절대 금액 없음). 아직 만들지 않았거나 숨겼으면 null, 예시 자료는 예시 글
	 */
	public record Question(String id, String industry, VirtualSimCategory category, String categoryName, String title, String body,
			List<PlacementDetails.Detail> details, String summary) {
	}

	/** basis: 이 배치고사의 채점 기준(REACTION 공시 직후, FIVE_DAY 반응 창 규칙 전에 시작한 배치고사의 5거래일). 화면이 고를 기간을 이 값으로 안내한다 */
	public record Placement(String placementId, String expiresAt, String basis, List<Question> questions) {
	}

	public record Answer(@NotBlank String questionId, Prediction prediction) {
	}

	public record Answers(@NotBlank String placementId, @NotNull @Size(min = 10, max = 10) List<@Valid @NotNull Answer> answers) {
	}

	/**
	 * company·date: 결과에서 공개하는 실제 회사·접수일(예시 자료는 date null). basis: 채점 기준(REACTION 반응 창, FIVE_DAY 이 규칙 전의 5거래일).
	 * movement: 정답 방향(REACTION이면 공시 직후, FIVE_DAY면 5거래일). reactionReturnRate·nextWeekReturnRate: 공시 직후(전날 종가 → 다음 거래일 종가)·그다음 주
	 * (다음 거래일 종가 → 5번째 후속 거래일 종가) 등락(REACTION만). subsequentReturnRate: 5거래일 등락(FIVE_DAY만). trend 이하: 그 유형의 과거 통계(룰셋.
	 * REACTION이면 공시 직후, FIVE_DAY면 5거래일. 채점 구간과 다른 통계뿐이면 null, 11-10)
	 */
	public record GradedItem(String questionId, Prediction prediction, String company, String date, String basis, String movement, BigDecimal reactionReturnRate,
			BigDecimal nextWeekReturnRate, BigDecimal subsequentReturnRate, boolean correct, String trend, BigDecimal categoryUpShare, BigDecimal categoryDownShare,
			Integer categorySampleCount) {

		GradedItem withoutStats() {
			return new GradedItem(questionId, prediction, company, date, basis, movement, reactionReturnRate, nextWeekReturnRate, subsequentReturnRate, correct, null,
					null, null, null);
		}

		GradedItem withBasis(String basis) {
			return new GradedItem(questionId, prediction, company, date, basis, movement, reactionReturnRate, nextWeekReturnRate, subsequentReturnRate, correct, trend,
					categoryUpShare, categoryDownShare, categorySampleCount);
		}
	}

	public record PlacementResult(String placementId, int correct, int total, VirtualContestBoard board, List<GradedItem> items, Entry entry) {
	}

	// ───────── 판 ─────────

	/** leverage: 대회 판은 레버리지가 없어 1만 받는다(생략하면 1, 다른 값은 400, policies §8-9) */
	public record RoundStart(@NotNull UUID startId, Integer leverage) {
	}

	public record RoundInfo(int roundNumber, long startBalance, int roundsLeftToday) {
	}

	public record RoundStarted(String sessionToken, String expiresAt, Snapshot snapshot, RoundInfo round) {
	}

	// ───────── 내 기록·랭킹 ─────────

	public record PlacementSummary(int correct, VirtualContestBoard board) {
	}

	public record WeekProgress(int week, String endsOn, int points) {
	}

	public record Today(Long startBalance, BigDecimal returnRate, BigDecimal targetRate, int rounds, int roundsLeft) {
	}

	public record BoardChange(VirtualContestBoard from, VirtualContestBoard to, int weekPoints, String at) {
	}

	public record Entry(String contestId, String alias, PlacementSummary placement, VirtualContestBoard board, long seedMoney, long balance, long profit,
			BigDecimal returnRate, BigDecimal excessRate, int boardPoints, WeekProgress week, Today today, int rank, int participants, int rounds, boolean activeRound,
			boolean liquidated, BoardChange lastBoardChange, String joinedAt, List<RoundRecord> recentRounds, List<DayRecord> scoredDays) {
	}

	/** 내 판 하나의 결과(본인만). 진행 중이면 끝 잔액·수익률·끝난 방식이 null */
	public record RoundRecord(int roundNumber, VirtualContestBoard board, String date, String status, String endReason, long startBalance, Long endBalance,
			Long holdBalance, BigDecimal returnRate, BigDecimal holdReturnRate, BigDecimal excessRate, String startedAt, String endedAt) {
	}

	/** 하루 점수를 정한 날. excessRate: 그날 판들의 초과 수익률 평균(판이 없으면 null) */
	public record DayRecord(String date, VirtualContestBoard board, int rounds, BigDecimal excessRate, int points) {
	}

	public record Result(String contestId, VirtualContestBoard placementBoard, VirtualContestBoard finalBoard, VirtualContestBoard highestBoard,
			int boardPoints, long balance, long profit, BigDecimal returnRate, BigDecimal excessRate, int rank, int participants, int rounds, boolean liquidated,
			FinalWeek finalWeek) {
	}

	/** 마지막 주(22일~말일) 판정. 판은 바꾸지 않고 기록만 한다 */
	public record FinalWeek(int points, Outcome result) {

		public enum Outcome {
			PROMOTE, DEMOTE, STAY
		}
	}

	public record Mine(String alias, Entry current, List<Result> history) {
	}

	public record RankingRow(int rank, String alias, int boardPoints, BigDecimal excessRate, long balance, long profit, BigDecimal returnRate, int rounds, boolean liquidated,
			boolean isMe) {
	}

	public record Ranking(String contestId, VirtualContestBoard board, String status, int participants, List<RankingRow> items, RankingRow me) {
	}
}
