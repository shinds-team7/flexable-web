package com.flexable.web.goalscenario;

import com.flexable.web.common.ApiException;

/** 입력 범위(policies §7-1). 월 납입 가능액·시작 금액·목표 금액. */
final class ScenarioBudget {

	static final long MONTHLY_MIN = 10_000;
	static final long MONTHLY_MAX = 10_000_000;
	static final long UNIT = 1_000;
	static final long START_MAX = 1_000_000_000;
	static final long TARGET_MIN = 1_000_000;
	static final long TARGET_MAX = 1_000_000_000;

	private ScenarioBudget() {
	}

	/** 1만 원~1,000만 원, 천 원 단위. 비었거나 벗어나면 400(field = monthlyBudget). */
	static void validateMonthly(Long budget) {
		if (budget == null || budget < MONTHLY_MIN || budget > MONTHLY_MAX || budget % UNIT != 0) {
			throw ApiException.invalid("monthlyBudget", "월 납입 가능액은 1만 원부터 1,000만 원까지 천 원 단위로 넣을 수 있어요");
		}
	}

	/** 0원~10억 원 정수. 비었거나 벗어나면 400(field = startAmount). */
	static void validateStart(Long start) {
		if (start == null || start < 0 || start > START_MAX) {
			throw ApiException.invalid("startAmount", "시작 금액은 0원부터 10억 원까지 넣을 수 있어요");
		}
	}

	/** 선택 칸. 있으면 100만 원~10억 원 정수, 벗어나면 400(field = targetAmount). */
	static void validateTarget(Long target) {
		if (target != null && (target < TARGET_MIN || target > TARGET_MAX)) {
			throw ApiException.invalid("targetAmount", "목표 금액은 100만 원부터 10억 원까지 넣을 수 있어요");
		}
	}
}
