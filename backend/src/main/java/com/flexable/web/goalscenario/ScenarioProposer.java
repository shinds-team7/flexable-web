package com.flexable.web.goalscenario;

import java.util.List;

/**
 * 조합을 정하는 제안기. AI 제안기는 키를 넣는 작업에서 붙인다. 지금은 AI가 없으므로 서비스가 데모 조합을 쓴다(AI_UNAVAILABLE).
 * 제안기는 상품 유형과 비중·문구만 내고, 금액·확률은 서버가 계산한다.
 */
interface ScenarioProposer {

	/** 쓸 수 있는지(키가 있는지). */
	boolean enabled();

	/**
	 * 목표 금액·기한에 맞춘 시나리오 2~3개. 실패하면 Failed를 던진다.
	 * 목표 이름은 넘기지 않는다(외부 전송 항목을 줄인다).
	 */
	List<Proposals.Draft> propose(long targetAmount, int years);

	class Failed extends RuntimeException {
		Failed(String message) {
			super(message);
		}
	}
}
