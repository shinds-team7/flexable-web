package com.flexable.web.ai;

import java.util.List;

/** 호출에는 목표 종류·계산된 사실만 넘긴다. 회원 식별자·이름·목표 이름은 받지 않는다. */
public interface GoalCoachClient {
	boolean enabled();

	Result generate(String factsJson, List<String> placeholders);

	public record Result(String content, String model, Integer promptTokens, Integer completionTokens) {
	}

	public record Content(String headline, String summary, List<Step> steps) {
		public record Step(String title, String detail) {
		}
	}

	/** 원인 예외·응답 본문을 보존하지 않는다(로그에 키·본문이 섞이지 않게 한다). */
	class Failed extends RuntimeException {
		public Failed() {
			super("AI_FAILED");
		}
	}
}
