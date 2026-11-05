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

	/** 배치고사 문제(실제 과거 공시). 회사명·날짜는 결과에서 공개한다. body: 실제 공시는 null(제목만), 예시 자료는 예시 글 */
	public record Question(String id, String industry, VirtualSimCategory category, String categoryName, String title, String body) {
	}

	public record Placement(String placementId, String expiresAt, List<Question> questions) {
	}

	public record Answer(@NotBlank String questionId, Prediction prediction) {
	}

	public record Answers(@NotBlank String placementId, @NotNull @Size(min = 10, max = 10) List<@Valid @NotNull Answer> answers) {
	}

	/** company·date: 결과에서 공개하는 실제 회사·접수일(예시 자료는 date null), movement·subsequentReturnRate: 그 뒤 5거래일 실제 방향·등락, trend 이하: 그 유형의 과거 통계 */
	public record GradedItem(String questionId, Prediction prediction, String company, String date, String movement, BigDecimal subsequentReturnRate,
			boolean correct, String trend, BigDecimal categoryUpShare, BigDecimal categoryDownShare, Integer categorySampleCount) {
	}

	public record PlacementResult(String placementId, int correct, int total, VirtualContestBoard board, List<GradedItem> items, Entry entry) {
	}

	// ───────── 판 ─────────

	public record RoundStart(@NotNull UUID startId) {
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
			int boardPoints, long balance, long profit, BigDecimal returnRate, BigDecimal excessRate, int rank, int participants, int rounds, boolean liquidated) {
	}

	public record Mine(String alias, Entry current, List<Result> history) {
	}

	public record RankingRow(int rank, String alias, int boardPoints, BigDecimal excessRate, long balance, long profit, BigDecimal returnRate, int rounds, boolean liquidated,
			boolean isMe) {
	}

	public record Ranking(String contestId, VirtualContestBoard board, String status, int participants, List<RankingRow> items, RankingRow me) {
	}
}
