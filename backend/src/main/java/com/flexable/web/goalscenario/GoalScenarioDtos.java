package com.flexable.web.goalscenario;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** POST /goal/scenarios 요청·응답(docs/contracts/web-api.yaml GoalScenarioResult). */
final class GoalScenarioDtos {

	private GoalScenarioDtos() {
	}

	/** 숫자 칸은 비어 있을 수 있어 래퍼 타입으로 받고 서비스가 검사한다. monthlyBudget(월 납입 가능액)은 선택이다(policies §7-1). */
	record Request(String name, Long targetAmount, Integer months, Long monthlyBudget) {
		Request(String name, Long targetAmount, Integer months) {
			this(name, targetAmount, months, null);
		}
	}

	record Item(String code, String name, String company) {
	}

	/** 계산에 쓰지 않고 함께 보여 주는 같은 유형의 상품(policies §7-2). ratePercent는 적금만 있다. */
	record Alternative(String code, String name, String company, String ratePercent) {
	}

	/**
	 * alternatives가 없는 이전 저장본도 빈 목록으로 읽는다. termMonths는 적금 만기 개월(적금만, 기한보다 짧을 수 있다).
	 * termMonths가 없는 이전 저장본은 SavedScenarioService가 기한 개월로 채운다.
	 */
	record Product(ProductType type, List<Item> items, String ratePercent, boolean isSample, List<Alternative> alternatives, Integer termMonths) {
		Product {
			alternatives = alternatives == null ? List.of() : alternatives;
		}
	}

	record MixItem(ProductType type, int ratioPercent, Long monthly) {
	}

	record Outcome(String kind, Long fixedAmount, Long low, Long median, Long high, int chanceBp, int lossBp) {
	}

	/**
	 * explanationParts는 해설 네 칸(옛 재사용 조합·옛 저장본은 null), resultText는 서버가 만든 결과 문장(policies §7-5).
	 * 저장본 스냅샷에는 resultText를 넣지 않고 조회할 때 만든다(SavedScenarioService).
	 * withinBudget·overBudgetBy는 월 납입 가능액과 필요 월 금액의 비교(§7-5). 가능액을 넣지 않았거나 옛 저장본이면 둘 다 null.
	 */
	record Scenario(String id, String title, String summary, String explanation, Proposals.Parts explanationParts, String resultText,
			List<MixItem> mix, boolean reachable, Long monthly, Long paid, Outcome outcome, Boolean withinBudget, Long overBudgetBy) {
		/** 같은 시나리오에 결과 문장만 바꿔 끼운다. */
		Scenario withResultText(String text) {
			return new Scenario(id, title, summary, explanation, explanationParts, text, mix, reachable, monthly, paid, outcome, withinBudget,
					overBudgetBy);
		}

		/**
		 * 월 납입 가능액과 비교한 값을 채운다(policies §7-5). 필요 월 금액이 가능액 이하면 안, 넘거나 월 금액을 찾지 못했으면 밖이다.
		 * 밖이면 정해 둔 대안 문장(ScenarioBudget.OVER)을 해설의 "주의할 점과 맞는 사람" 칸 끝과 합친 해설 끝에 붙인다. budget이 null이면 그대로다.
		 */
		Scenario withBudget(Long budget) {
			if (budget == null) {
				return this;
			}
			boolean within = reachable && monthly != null && monthly <= budget;
			if (within) {
				return new Scenario(id, title, summary, explanation, explanationParts, resultText, mix, reachable, monthly, paid, outcome, true, null);
			}
			Proposals.Parts parts = explanationParts == null ? null
					: new Proposals.Parts(explanationParts.reason(), explanationParts.roles(), explanationParts.comparison(),
							ScenarioBudget.append(explanationParts.fit()));
			String joined = parts == null ? ScenarioBudget.appendParagraph(explanation) : parts.joined();
			return new Scenario(id, title, summary, joined, parts, resultText, mix, reachable, monthly, paid, outcome, false,
					reachable && monthly != null ? monthly - budget : null);
		}
	}

	/** monthlyBudget은 입력한 월 납입 가능액(없으면 null). */
	record Result(String resultId, String name, long targetAmount, int months, Long monthlyBudget, String proposer, String fallbackReason,
			LocalDate asOf, String returnsFrom, String returnsTo, int paths, long seed, BigDecimal reachShare,
			List<Product> products, List<Scenario> scenarios, List<String> assumptions, String notice, boolean isSample, AiUsage aiUsage,
			boolean aiReused) {
	}

	/** 회원의 AI 조합 횟수(KST 하루). 비회원이면 응답에서 null. */
	record AiUsage(int limitPerDay, int remainingToday) {
	}

	record SaveRequest(String resultId, String scenarioId) {
	}

	record SavedSummary(long id, OffsetDateTime savedAt, String name, long targetAmount, int months, LocalDate asOf, String title,
			boolean reachable, Long monthly, String kind) {
	}

	record SavedList(List<SavedSummary> items, int limit) {
	}

	/** monthlyBudget은 저장할 때 넣은 월 납입 가능액(없었거나 옛 저장본이면 null). */
	record Saved(long id, OffsetDateTime savedAt, String name, long targetAmount, int months, Long monthlyBudget, String proposer, LocalDate asOf,
			String returnsFrom, String returnsTo, int paths, BigDecimal reachShare, List<Product> products, Scenario scenario,
			List<Scenario> alternatives, List<String> assumptions, String notice, boolean isSample) {
	}
}
