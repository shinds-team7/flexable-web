package com.flexable.web.goalscenario;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

/** POST /goal/scenarios 요청·응답(docs/contracts/web-api.yaml GoalScenarioResult). */
final class GoalScenarioDtos {

	private GoalScenarioDtos() {
	}

	/**
	 * 숫자 칸은 비어 있을 수 있어 래퍼 타입으로 받고 서비스가 검사한다(policies §7-1).
	 * 시작 금액·월 납입 가능액·기한은 필수, 목표 금액은 선택(null이면 목표 달성 추정을 계산하지 않는다).
	 */
	record Request(Long startAmount, Long monthlyBudget, Integer months, Long targetAmount) {
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

	/** 유형별 월 금액과 시작 금액의 몫. start는 #431 전 저장본이면 null. */
	record MixItem(ProductType type, int ratioPercent, Long monthly, Long start) {
	}

	/**
	 * 기한 말 결과(§7-5). highGain = 상위 10%(확정형은 확정 금액) − 넣은 돈. chanceBp는 목표 금액이 있을 때만(없으면 null).
	 * #431 전 저장본은 highGain이 없어 조회할 때 채운다.
	 */
	record Outcome(String kind, Long fixedAmount, Long low, Long median, Long high, Long highGain, Integer chanceBp, int lossBp) {
	}

	/** 그래프 한 점: month달 말(0은 시작) 경로별 금액의 하위 10%·중간값·상위 10%(§7-5). */
	record SeriesPoint(int month, long low, long median, long high) {
	}

	/**
	 * explanationParts는 해설 네 칸(옛 데이터는 null), resultText는 서버가 만든 결과 문장(policies §7-5).
	 * 저장본 스냅샷에는 resultText를 넣지 않고 조회할 때 만든다(SavedScenarioService).
	 * monthly는 이 시나리오의 월 금액(= 월 납입 가능액). #431 전 저장본은 그때의 필요 월 금액이고, 찾지 못했으면 monthly·paid·outcome이 null이다.
	 * series는 달마다의 결과 범위(#431 전 저장본은 null).
	 */
	record Scenario(String id, String title, String summary, String explanation, Proposals.Parts explanationParts, String resultText,
			List<MixItem> mix, Long monthly, Long paid, Outcome outcome, List<SeriesPoint> series) {
		/** 같은 시나리오에 결과 문장만 바꿔 끼운다. */
		Scenario withResultText(String text) {
			return new Scenario(id, title, summary, explanation, explanationParts, text, mix, monthly, paid, outcome, series);
		}
	}

	/** 시작 금액의 적금 몫을 맡기는 정기예금(policies §7-4). 조건에 맞는 예금이 없으면 응답에서 null이고 그 몫은 CMA로 계산한다. */
	record StartDeposit(String code, String name, String company, String ratePercent, int termMonths) {
	}

	/** targetAmount는 입력한 목표 금액(없으면 null). */
	record Result(String resultId, long startAmount, long monthlyBudget, int months, Long targetAmount, String proposer, String fallbackReason,
			LocalDate asOf, String returnsFrom, String returnsTo, int paths, long seed, List<Product> products, StartDeposit startDeposit,
			List<Scenario> scenarios, List<String> assumptions, String notice, boolean isSample, AiUsage aiUsage, boolean aiReused) {
		Result withId(String id) {
			return new Result(id, startAmount, monthlyBudget, months, targetAmount, proposer, fallbackReason, asOf, returnsFrom, returnsTo, paths, seed,
					products, startDeposit, scenarios, assumptions, notice, isSample, aiUsage, aiReused);
		}
	}

	/** 회원의 시나리오 보기 횟수(KST 하루). 비회원이면 응답에서 null. */
	record AiUsage(int limitPerDay, int remainingToday) {
	}

	/** name은 저장할 때 붙이는 이름(1~20자). */
	record SaveRequest(String resultId, String scenarioId, String name) {
	}

	/** monthlyBudget은 월 금액(#431 전 저장본은 저장한 플랜의 필요 월 금액, 찾지 못했으면 null). */
	record SavedSummary(long id, OffsetDateTime savedAt, String name, long startAmount, Long monthlyBudget, int months, Long targetAmount,
			LocalDate asOf, String title, String kind) {
	}

	record SavedList(List<SavedSummary> items, int limit) {
	}

	record Saved(long id, OffsetDateTime savedAt, String name, long startAmount, Long monthlyBudget, int months, Long targetAmount, String proposer,
			LocalDate asOf, String returnsFrom, String returnsTo, int paths, List<Product> products, StartDeposit startDeposit, Scenario scenario,
			List<Scenario> alternatives, List<String> assumptions, String notice, boolean isSample) {
	}
}
