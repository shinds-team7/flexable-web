package com.flexable.web.savings;

import java.math.BigDecimal;
import java.util.List;

import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;

/** 응답 필드는 웹 화면(src/data/savings.ts)의 타입과 같다. 금액은 원 단위 정수, 금리는 연 %. */
final class SavingsDtos {

	private SavingsDtos() {
	}

	record Result(long principal, long interestPreTax, long tax, long interestAfterTax, long maturityAmount,
			long excludedAmount, String rateBasis) {
	}

	record Product(String id, String company, String name, String sector, BigDecimal baseRate, BigDecimal maxRate,
			int termMonths, String reserveType, String interestType, String disclosureMonth, Long maxLimit,
			String joinMember, String joinDeny, Boolean openToAll, String disclosureUrl, String dataAsOf,
			Result result) {
	}

	record ProductDetail(String id, String company, String name, String sector, BigDecimal baseRate,
			BigDecimal maxRate, int termMonths, String reserveType, String interestType, String disclosureMonth,
			Long maxLimit, String joinMember, String joinDeny, Boolean openToAll, String disclosureUrl,
			String dataAsOf, String specialConditionText) {
	}

	/** items는 요청한 쪽(page)만. total·minInterestAfterTax·maxInterestAfterTax는 조건에 맞는 전체 기준이다. */
	record ProductList(List<Product> items, int total, int page, int size, Long minInterestAfterTax,
			Long maxInterestAfterTax, int noRateCount, String disclosureMonth, String dataAsOf, String notice,
			boolean isSample) {
	}

	record Company(String name, String sector) {
	}

	/** 청년정책(적금·저축·통장 계열). 금리가 없어 계산하지 않는다. 비어 있는 항목은 null. */
	record Policy(String id, String name, String summary, String support, String category, String agency,
			String operator, String applyPeriod, String bizPeriod, Integer minAge, Integer maxAge, String applyMethod,
			String screening, String documents, String applyUrl, String refUrl, String etc, String incomeNote,
			String qualification, String restriction, String region, String dataAsOf) {
	}

	record SimulateRequest(@NotBlank String productId, @Min(1) long monthly, @Min(1) int termMonths,
			@NotBlank String reserveType, @NotNull String rateBasis) {
	}

	record Simulation(long principal, long interestPreTax, long tax, long interestAfterTax, long maturityAmount,
			long excludedAmount, String rateBasis, List<String> assumptions, String notice, boolean isSample) {
	}
}
