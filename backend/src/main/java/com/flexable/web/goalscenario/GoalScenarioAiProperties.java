package com.flexable.web.goalscenario;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * 목표 시나리오 AI 조합 설정(policies §7-6). 회원당 하루 무료 freeDailyLimit회·플러스 plusDailyLimit회(시나리오 보기, #431), 서비스 전체 하루 dailyCap회(worker의 미리 만들기 AI 호출).
 * logRejected를 켜면 검사에 걸린 칸의 문구를 서버 로그에 남긴다(원인을 찾을 때만 켠다. 기본 꺼짐).
 */
@ConfigurationProperties("app.goal.scenario.ai")
public record GoalScenarioAiProperties(@DefaultValue("5") Integer freeDailyLimit, @DefaultValue("10") Integer plusDailyLimit,
		@DefaultValue("300") Integer dailyCap, @DefaultValue("false") Boolean logRejected) {
	public GoalScenarioAiProperties {
		freeDailyLimit = freeDailyLimit == null ? 5 : freeDailyLimit;
		plusDailyLimit = plusDailyLimit == null ? 10 : plusDailyLimit;
		dailyCap = dailyCap == null ? 300 : dailyCap;
		logRejected = Boolean.TRUE.equals(logRejected);
		if (freeDailyLimit < 0 || plusDailyLimit < 0 || dailyCap < 0) {
			throw new IllegalArgumentException("목표 시나리오 AI 한도는 음수일 수 없어요");
		}
	}

	/** 요금제별 회원 하루 한도. */
	int dailyLimit(ScenarioAiQuota.Plan plan) {
		return plan == ScenarioAiQuota.Plan.PLUS ? plusDailyLimit : freeDailyLimit;
	}
}
