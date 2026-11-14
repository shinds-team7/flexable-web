package com.flexable.web.goalscenario;

import java.util.List;
import java.util.Map;

/**
 * 조합을 정하는 제안기(policies §7-6). 키가 있으면 OpenAI 제안기(OpenAiScenarioProposer)가 붙는다.
 * 제안기는 worker가 기한마다 미리 부르고(#431), 요청 중에는 부르지 않는다. 상품 유형과 비중·문구만 내고, 금액·확률은 서버가 계산한다.
 */
interface ScenarioProposer {

	/** 쓸 수 있는지(키가 있는지). */
	boolean enabled();

	/** 미리 만드는 조합의 프롬프트 버전(#431). 저장된 조합을 찾는 데 쓴다. 모르면 null이고, 그러면 AI 조합을 쓰지 않는다. */
	default String planVersion() {
		return null;
	}

	/** 미리 만든 유형 해설의 프롬프트 버전(#417). 저장된 해설을 찾는 데 쓴다. 모르면 null. */
	default String typeRoleVersion() {
		return null;
	}

	/**
	 * 기한 하나의 안정·균형·적극 시나리오 3개(#431). 해설의 roles 칸은 비중이 있는 유형의 미리 만든 해설(roles, 다섯 유형 모두)에 비중을 넣어 만든다.
	 * 실패하면 Failed를 던진다. 금액·회원 정보는 넘기지 않는다.
	 */
	default List<Proposals.Draft> proposePlan(PlanInput input, Map<ProductType, TypeRoleStore.Role> roles) {
		throw new Failed("NO_KEY");
	}

	/** AI에게 보내는 값 전부: 기한(개월)과 유형별 통계. 시작 금액·월 금액·목표 금액은 보내지 않는다. */
	record PlanInput(int months, List<TypeStat> stats) {
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
