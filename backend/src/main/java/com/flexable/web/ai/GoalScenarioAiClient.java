package com.flexable.web.ai;

/**
 * 목표 달성 시나리오의 조합 제안(policies §7-6). 입력은 목표 금액·기한과 서버가 계산한 상품 유형별 통계뿐이다.
 * 목표 이름·회원 식별자·이메일은 받지 않는다. 금액·확률은 웹 서버가 계산하고, 여기서는 유형별 비중과 문구만 받는다.
 */
public interface GoalScenarioAiClient {
	boolean enabled();

	/** inputJson을 보내고 구조화 출력(JSON 문자열)을 돌려준다. 실패하면 Failed. */
	Result propose(String inputJson);

	public record Result(String content, String model, Integer promptTokens, Integer completionTokens) {
	}

	/** 원인 예외·응답 본문을 보존하지 않는다(로그에 키·본문이 섞이지 않게 한다). */
	class Failed extends RuntimeException {
		public Failed() {
			super("AI_FAILED");
		}
	}
}
