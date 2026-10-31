package com.flexable.web.deposit;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** 응답 필드는 웹 화면(src/data/deposit.ts)의 타입과 같다. 금액은 원 단위 정수, 금리는 연 %. */
final class DepositDtos {

	private DepositDtos() {
	}

	record Result(long principal, long interestPreTax, long tax, long interestAfterTax, long maturityAmount,
			long excludedAmount, String rateBasis) {
	}

	record Product(String id, String company, String name, String sector, BigDecimal baseRate, BigDecimal maxRate,
			int termMonths, String interestType, String disclosureMonth, Long maxLimit, String joinMember,
			String joinDeny, Boolean openToAll, String disclosureUrl, String dataAsOf, Result result) {
	}

	record ProductDetail(String id, String company, String name, String sector, BigDecimal baseRate,
			BigDecimal maxRate, int termMonths, String interestType, String disclosureMonth, Long maxLimit,
			String joinMember, String joinDeny, Boolean openToAll, String disclosureUrl, String dataAsOf,
			String specialConditionText) {
	}

	/** items는 요청한 쪽(page)만. total·minInterestAfterTax·maxInterestAfterTax는 조건에 맞는 전체 기준이다. */
	record ProductList(List<Product> items, int total, int page, int size, Long minInterestAfterTax,
			Long maxInterestAfterTax, int noRateCount, String disclosureMonth, String dataAsOf, String notice,
			boolean isSample) {
	}

	record Company(String name, String sector) {
	}

	record SimulateRequest(@NotBlank String productId, @Min(1) long amount, @Min(1) int termMonths,
			@NotBlank String interestType, @NotNull String rateBasis) {
	}

	/** 기간 동안 내 돈의 한 점: month개월 끝까지 쌓인 세전 이자(맡긴 돈은 처음부터 같다). */
	record Point(int month, long principal, long interestPreTax) {
	}

	record Simulation(long principal, long interestPreTax, long tax, long interestAfterTax, long maturityAmount,
			long excludedAmount, String rateBasis, List<Point> series, List<String> assumptions, String notice,
			boolean isSample) {
	}
}
