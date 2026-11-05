package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;

import jakarta.validation.constraints.DecimalMax;
import jakarta.validation.constraints.DecimalMin;
import jakarta.validation.constraints.Digits;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

import com.fasterxml.jackson.annotation.JsonInclude;
import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Frame;
import com.flexable.web.practice.PracticeDtos.Portfolio;
import com.flexable.web.practice.PracticeDtos.Prediction;

/** /virtual-sim/* 요청·응답(docs/contracts/web-api.yaml VirtualSimSnapshot). 토큰·명령·자산 모양은 과거 시장 연습(PracticeDtos)과 같다 */
public final class VirtualSimDtos {

	private VirtualSimDtos() {
	}

	public record Start(@NotNull UUID startId,
			@NotNull @DecimalMin("10000") @DecimalMax("100000000") @Digits(integer = 9, fraction = 0) BigDecimal initialAmount) {
	}

	public record Status(boolean available, boolean isSample) {
	}

	/**
	 * 사건의 가상 매매 선택(예상 버튼 없음). quantity: 요청 주 수. HOLD는 0, BUY·SELL은 1 이상(서버가 지금 상태로 상한을 본다, 대회 판은 잔액 상한이 없어 고정 최대값이 없다).
	 * 예상은 매매 방향으로 정한다: BUY = 오른다, SELL = 내린다, HOLD = 채점 제외(policies §8-6)
	 */
	public record Decision(@NotBlank @Size(min = 43, max = 128) String sessionToken, @NotNull UUID commandId, @NotNull @Min(0) Integer expectedVersion,
			@NotBlank String eventId, @NotNull Action action, @NotNull @Min(0) Long quantity) {
	}

	/** 수량 입력 미리보기용 서버 값: 기준 가격(지금 종가), 지금 현금으로 그 가격에 살 수 있는 최대 수량, 팔 수 있는 최대 수량(보유) */
	public record OrderLimits(long referencePrice, long maxBuyShares, long maxSellShares) {
	}

	public record Company(String name, String industry, String intro) {
	}

	public record Generator(boolean aiGenerated, String model, String generatedAt) {
	}

	public record RulesetInfo(String version, String dataFrom, String dataTo) {
	}

	public record Event(String id, VirtualSimCategory category, String categoryName, String title, String body, String date, OrderLimits orderLimits) {
	}

	/**
	 * prediction: 매매 방향에서 정한 예상(BUY → POSITIVE, SELL → NEGATIVE, HOLD → null). quantity: 요청 수량, executedShares: 실제 체결 수량.
	 * categoryDownShare: 5거래일 뒤 내린 비율 floor(down × 10000 / n) / 10000(보합은 오름·내림 어디에도 들지 않는다).
	 * outcome·trendOutcome은 늘 null(일반·대회 모두 채점 없음, policies §8-6).
	 * 판정 전에는 outcomeDate·subsequentReturnRate·movement·categoryUpShare·categoryDownShare·categorySampleCount·trend가 null
	 */
	public record Result(String eventId, VirtualSimCategory category, String categoryName, String title, String date, Prediction prediction,
			Action action, long quantity, String execution, String executedDate, Long executedPrice, Long executedShares, String outcome,
			String outcomeDate, BigDecimal subsequentReturnRate, String movement, BigDecimal categoryUpShare, BigDecimal categoryDownShare, Integer categorySampleCount,
			String trend, String trendOutcome) {
	}

	/**
	 * 대회 판일 때만 Snapshot.contest. FINISHED일 때만 endBalance(새 대회 잔액 = 마지막 portfolio.total), holdBalance(같은 판을 유지만 했을 때 끝 잔액),
	 * holdReturnRate(유지만 했을 때 수익률 = (holdBalance − 시작 잔액) / 시작 잔액), excessRate(이 판의 초과 수익률 = (endBalance − holdBalance) / 시작 잔액,
	 * 하루 점수 기준). 그 전에는 null
	 */
	public record ContestRound(String contestId, VirtualContestBoard board, int roundNumber, Long endBalance, Long holdBalance, BigDecimal holdReturnRate,
			BigDecimal excessRate) {
	}

	/** contest: 대회 판일 때만 있고 일반 세션에서는 필드 자체가 없다(계약 VirtualSimContestRound) */
	public record Snapshot(int version, String status, Company company, Generator generator, RulesetInfo ruleset, long initialAmount, boolean isSample,
			@JsonInclude(JsonInclude.Include.NON_NULL) ContestRound contest, int totalDays, List<Candle> candles, List<Frame> frames, Portfolio portfolio, Event event, List<Result> decisions, String notice,
			List<String> sources) {
	}

	public record Started(String sessionToken, String expiresAt, Snapshot snapshot) {
	}
}
