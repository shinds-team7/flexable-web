package com.flexable.web.engagement;

import org.springframework.boot.context.properties.ConfigurationProperties;
import org.springframework.boot.context.properties.bind.DefaultValue;

@ConfigurationProperties("app.goal.coach")
public record GoalCoachProperties(@DefaultValue("3") Integer freeDailyLimit, @DefaultValue("300") Integer dailyCap) {
	public GoalCoachProperties {
		freeDailyLimit = freeDailyLimit == null ? 3 : freeDailyLimit;
		dailyCap = dailyCap == null ? 300 : dailyCap;
		if (freeDailyLimit < 0 || dailyCap < 0) {
			throw new IllegalArgumentException("목표 안내 한도는 음수일 수 없어요");
		}
	}
}
