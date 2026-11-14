package com.flexable.web.ai;

/**
 * 목표 달성 시나리오의 조합 제안(policies §7-6). worker가 기한마다 미리 부른다(#431). 입력은 기한과 서버가 계산한 상품 유형별 통계뿐이다.
 * 시작 금액·월 금액·목표 금액·회원 식별자·이메일은 받지 않는다. 금액·확률은 웹 서버가 계산하고, 여기서는 유형별 비중과 문구만 받는다.
 */
public interface GoalScenarioAiClient {
	/** 응답 스키마의 해설 칸. 순서대로 문단으로 합쳐 해설 하나가 된다: 조합 이유, 상품별 역할과 근거, 다른 시나리오와의 차이, 주의할 점과 맞는 사람. */
	java.util.List<String> EXPLANATION_FIELDS = java.util.List.of("reason", "roles", "comparison", "fit");
	/**
	 * 응답 스키마에서 roles 대신 받는 유형별 칸(v10, #402). 유형 코드마다 넣은 이유·근거·전망을 받고,
	 * 서버가 비중이 있는 유형만 적금 → CMA → 국내 → 미국 → 코스피 순서로 유형마다 한 줄로 합쳐 roles를 만든다.
	 */
	String TYPE_ROLES = "typeRoles";
	java.util.List<String> TYPE_ROLE_FIELDS = java.util.List.of("reason", "basis", "outlook");

	boolean enabled();

	/** 미리 만드는 조합의 프롬프트 버전(#431). 저장된 조합을 찾는 데 쓴다. */
	default String planPromptVersion() {
		return null;
	}

	/** 기한 하나의 안정·균형·적극 시나리오 3개(비중·제목·설명·reason·comparison·fit)를 받는다(#431). 입력은 기한과 유형 통계뿐이다. 실패하면 Failed. */
	default Result plan(String inputJson) {
		throw new Failed("NO_KEY");
	}

	/** 미리 만드는 유형 해설의 프롬프트 버전(#417). */
	default String typeRolePromptVersion() {
		return null;
	}

	/** 유형 하나(type은 유형 코드)의 해설(reason·basis·outlook)을 받는다(#417). 입력은 유형 자료뿐이고 회원·목표 정보가 없다. */
	default Result typeRole(String type, String inputJson) {
		throw new Failed("NO_KEY");
	}

	public record Result(String content, String model, Integer promptTokens, Integer completionTokens) {
	}

	/**
	 * 원인 예외·응답 본문을 보존하지 않는다(로그에 키·본문이 섞이지 않게 한다).
	 * reason은 서버가 정한 분류만 담는다: NO_KEY·TIMEOUT·NETWORK·HTTP_상태코드·TRUNCATED·REFUSED·BAD_RESPONSE.
	 */
	class Failed extends RuntimeException {
		private final String reason;

		public Failed(String reason) {
			super("AI_FAILED");
			this.reason = reason;
		}

		public String reason() {
			return reason;
		}
	}
}
