package com.flexable.web.goalscenario;

/**
 * 월 납입 가능액(policies §7-1·7-5). 가능액은 선택 칸이고, 필요 월 금액 계산은 바꾸지 않고 비교에만 쓴다.
 * 가능액 밖인 시나리오에는 서버가 정해 둔 대안 문장을 해설에 붙인다. 숫자를 넣지 않고 대안 금액·기한을 계산하지 않는다.
 */
final class ScenarioBudget {

	static final long MIN = 10_000;
	static final long UNIT = 1_000;
	static final String OVER = "이 조합은 월 납입 가능액보다 많이 넣어야 해요. 목표를 낮춰보거나 월 납입 가능액을 늘려보세요.";

	private ScenarioBudget() {
	}

	/** 가능액이 없으면 통과. 1만 원 이상·목표 금액 이하·천 원 단위가 아니면 400(field = monthlyBudget). */
	static void validate(Long budget, long target) {
		if (budget == null) {
			return;
		}
		if (budget < MIN || budget > target || budget % UNIT != 0) {
			throw com.flexable.web.common.ApiException.invalid("monthlyBudget", "월 납입 가능액은 1만 원부터 목표 금액까지 천 원 단위로 넣을 수 있어요");
		}
	}

	/** 해설 한 칸 끝에 대안 문장을 붙인다. 걸린 문장을 지워 빈 칸이면 대안 문장만 남는다. */
	static String append(String text) {
		return text == null || text.isBlank() ? OVER : text.strip() + " " + OVER;
	}

	/** 네 칸이 없는 옛 해설(문단 하나)에는 새 문단으로 붙인다. */
	static String appendParagraph(String text) {
		return text == null || text.isBlank() ? OVER : text.strip() + "\n\n" + OVER;
	}
}
