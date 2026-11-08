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

	/** 계산에 쓰지 않고 함께 보여 주는 같은 유형의 상품(policies §7-2). ratePercent는 적금만 있다. */
	record Alternative(String code, String name, String company, String ratePercent) {
	}

	/** alternatives가 없는 이전 저장본도 빈 목록으로 읽는다. */
	record Product(ProductType type, List<Item> items, String ratePercent, boolean isSample, List<Alternative> alternatives) {
		Product {
			alternatives = alternatives == null ? List.of() : alternatives;
		}
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
			List<Product> products, List<Scenario> scenarios, List<String> assumptions, String notice, boolean isSample, AiUsage aiUsage,
			boolean aiReused) {
	}

	/** 회원의 AI 조합 횟수(KST 하루). 비회원이면 응답에서 null. */
	record AiUsage(int limitPerDay, int remainingToday) {
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
