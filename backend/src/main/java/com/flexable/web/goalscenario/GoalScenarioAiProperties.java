package com.flexable.web.goalscenario;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

/**
 * 목표 시나리오 AI 조합 횟수(policies §7-6). 회원당 하루 무료 freeDailyLimit회·플러스 plusDailyLimit회, 서비스 전체 하루 dailyCap회.
 */
@ConfigurationProperties("app.goal.scenario.ai")
public record GoalScenarioAiProperties(@DefaultValue("3") Integer freeDailyLimit, @DefaultValue("10") Integer plusDailyLimit,
		@DefaultValue("300") Integer dailyCap) {
	public GoalScenarioAiProperties {
		freeDailyLimit = freeDailyLimit == null ? 3 : freeDailyLimit;
		plusDailyLimit = plusDailyLimit == null ? 10 : plusDailyLimit;
		dailyCap = dailyCap == null ? 300 : dailyCap;
		if (freeDailyLimit < 0 || plusDailyLimit < 0 || dailyCap < 0) {
			throw new IllegalArgumentException("목표 시나리오 AI 한도는 음수일 수 없어요");
		}
	}

	/** 요금제별 회원 하루 한도. */
	int dailyLimit(ScenarioAiQuota.Plan plan) {
		return plan == ScenarioAiQuota.Plan.PLUS ? plusDailyLimit : freeDailyLimit;
	}
}
