package com.flexable.web.goalscenario;

import java.util.List;

/**
 * 조합을 정하는 제안기(policies §7-6). 키가 있으면 OpenAI 제안기(OpenAiScenarioProposer)가 붙는다.
 * 제안기는 상품 유형과 비중·문구만 내고, 금액·확률은 서버가 계산한다.
 */
interface ScenarioProposer {

	/** 쓸 수 있는지(키가 있는지). */
	boolean enabled();

	/**
	 * 목표 금액·기한·월 납입 가능액과 유형별 통계에 맞춘 시나리오 3개. 실패하면 Failed를 던진다.
	 * 목표 이름·회원 식별자는 넘기지 않는다(외부 전송 항목을 줄인다).
	 */
	List<Proposals.Draft> propose(Input input);

	/** AI에게 보내는 값 전부. monthlyBudget은 사용자가 넣은 월 납입 가능액이고 넣지 않았으면 null이다. */
	record Input(long targetAmount, int months, Long monthlyBudget, List<TypeStat> stats) {
	}

	/**
	 * 유형별 사실. 금리 확정 유형은 ratePercent만, 투자 유형은 지난 60개월 월 수익률의 평균·표준편차와 최대 하락(소수, 0.05 = 5%)만 채운다.
	 * alternatives는 계산에 쓰지 않는 같은 유형의 다른 상품이다.
	 */
	record TypeStat(String type, String description, String ratePercent, String meanMonthlyReturn, String monthlyVolatility,
			String maxDrawdown, List<AltStat> alternatives) {
	}

	/** 같은 유형의 다른 상품. 적금은 company·ratePercent만, 지수 ETF는 통계만 채운다. */
	record AltStat(String name, String company, String ratePercent, String meanMonthlyReturn, String monthlyVolatility, String maxDrawdown) {
	}

	/** message는 서버가 정한 실패 분류(GoalScenarioAiClient.Failed)만 담는다. 응답 본문을 넣지 않는다. */
	class Failed extends RuntimeException {
		Failed(String message) {
			super(message);
		}
	}
}
