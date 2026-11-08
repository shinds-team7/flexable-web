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
	record Request(String name, Long targetAmount, Integer years, Long initialAmount) {
		Request(String name, Long targetAmount, Integer years) {
			this(name, targetAmount, years, null);
		}
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

	/** 처음 모은 돈 중 저축 몫과 그것을 둔 곳(DEPOSIT 예금, CMA). 처음 돈이 없으면 응답에서 null. */
	record InitialSaving(long amount, String place) {
	}

	/** 3년 뒤 금리가 1%포인트 낮아진다고 가정했을 때의 필요 월 금액. 4·5년일 때만 있다. */
	record RateDown(boolean reachable, Long monthly) {
	}

	/**
	 * style: SAFE·BALANCED·AGGRESSIVE(투자 비중이 낮은 순). noExtraNeeded: 처음 모은 돈만으로 닿아 매달 넣을 돈이 0원.
	 * 이전 저장본에는 style 등이 없어 null·false로 읽는다.
	 */
	record Scenario(String id, String title, String summary, String explanation, List<MixItem> mix, boolean reachable,
			Long monthly, Long paid, Outcome outcome, String style, boolean noExtraNeeded, InitialSaving initialSaving, RateDown rateDown) {
	}

	/** 3년 뒤 금리 가정. 4·5년일 때만 있다. */
	record RateAssumption(int afterMonths, String dropPercent) {
	}

	record Result(String resultId, String name, long targetAmount, int years, int months, String proposer, String fallbackReason,
			LocalDate asOf, String returnsFrom, String returnsTo, int paths, long seed, BigDecimal reachShare,
			List<Product> products, List<Scenario> scenarios, List<String> assumptions, String notice, boolean isSample, AiUsage aiUsage,
			boolean aiReused, long initialAmount, String recommendedId, RateAssumption rateAssumption, Alternative initialDeposit) {

		Result withId(String id) {
			return new Result(id, name, targetAmount, years, months, proposer, fallbackReason, asOf, returnsFrom, returnsTo, paths, seed,
					reachShare, products, scenarios, assumptions, notice, isSample, aiUsage, aiReused, initialAmount, recommendedId,
					rateAssumption, initialDeposit);
		}
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
			List<String> assumptions, String notice, boolean isSample, long initialAmount, RateAssumption rateAssumption,
			Alternative initialDeposit) {
	}
}
