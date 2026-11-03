package com.flexable.web.goalscenario;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** POST /goal/scenarios 요청·응답(docs/contracts/web-api.yaml GoalScenarioResult). */
final class GoalScenarioDtos {

	private GoalScenarioDtos() {
	}

	/** 숫자 칸은 비어 있을 수 있어 래퍼 타입으로 받고 서비스가 검사한다. */
	record Request(String name, Long targetAmount, Integer years) {
	}

	record Item(String code, String name, String company) {
	}

	record Product(ProductType type, List<Item> items, String ratePercent, boolean isSample) {
	}

	record MixItem(ProductType type, int ratioPercent, Long monthly) {
	}

	record Outcome(String kind, Long fixedAmount, Long low, Long median, Long high, int chanceBp, int lossBp) {
	}

	record Scenario(String id, String title, String summary, String explanation, List<MixItem> mix, boolean reachable,
			Long monthly, Long paid, Outcome outcome) {
	}

	record Result(String resultId, String name, long targetAmount, int years, int months, String proposer, String fallbackReason,
			LocalDate asOf, String returnsFrom, String returnsTo, int paths, long seed, BigDecimal reachShare,
			List<Product> products, List<Scenario> scenarios, List<String> assumptions, String notice, boolean isSample) {
	}

	record SaveRequest(String resultId, String scenarioId) {
	}

	record SavedSummary(long id, OffsetDateTime savedAt, String name, long targetAmount, int years, LocalDate asOf, String title,
			boolean reachable, Long monthly, String kind) {
	}

	record SavedList(List<SavedSummary> items, int limit) {
	}

	record Saved(long id, OffsetDateTime savedAt, String name, long targetAmount, int years, int months, String proposer, LocalDate asOf,
			String returnsFrom, String returnsTo, int paths, BigDecimal reachShare, List<Product> products, Scenario scenario,
			List<String> assumptions, String notice, boolean isSample) {
	}
}
