package com.flexable.web.simulation;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

import com.flexable.web.simulation.SimulationEngine.Mode;
import com.flexable.web.simulation.SimulationEngine.Point;

import jakarta.validation.Valid;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Size;

/** project2 docs/web/03-architecture.md §8-2 시뮬레이션 계약의 부분집합. */
public final class SimulationDtos {

	public static final long MIN_TOTAL = 10_000;
	public static final long MAX_TOTAL = 100_000_000;
	public static final long MIN_MONTHLY = 1_000;
	public static final long MAX_MONTHLY = 10_000_000;
	public static final int MAX_LEGS = 3;

	private SimulationDtos() {
	}

	public record Funding(@NotNull(message = "넣는 방식을 골라 주세요") Mode mode, Long totalAmount, Long monthlyAmount) {
	}

	/** weight는 0~1(0.5=50%). 모두 비우면 같은 비율로 나눈다. */
	public record Leg(@NotBlank(message = "종목을 골라 주세요") String instrumentId, BigDecimal weight) {
	}

	public record RunRequest(
			@NotNull(message = "시작 시점을 골라 주세요") LocalDate startDate,
			@NotNull(message = "넣는 방식을 골라 주세요") @Valid Funding funding,
			@NotNull(message = "종목을 골라 주세요") @Size(min = 1, max = MAX_LEGS, message = "종목은 1~3개 고를 수 있어요") List<@Valid Leg> legs) {
	}

	public record ResolvedInput(LocalDate startDate, LocalDate endDate, Mode mode) {
	}

	public record LegInfo(String id, String name, String kind, BigDecimal weight, long invested, long finalValue) {
	}

	public record Source(String name, String note) {
	}

	public record RunResponse(
			ResolvedInput resolvedInput,
			int contributionCount,
			long monthlyAmount,
			long totalInvested,
			long finalValue,
			long profit,
			BigDecimal returnRate,
			String engineVersion,
			LocalDate dataAsOf,
			String seriesBasis,
			List<LegInfo> legs,
			List<Point> series,
			List<Object> events,
			List<String> assumptions,
			String noticeKey,
			String notice,
			List<Source> sources) {
	}
}
