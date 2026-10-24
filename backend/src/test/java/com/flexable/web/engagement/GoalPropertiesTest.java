package com.flexable.web.engagement;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.boot.context.properties.EnableConfigurationProperties;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.boot.test.context.TestConfiguration;

import com.flexable.web.ai.OpenAiProperties;

class GoalPropertiesTest {
	@TestConfiguration(proxyBeanMethods = false)
	@EnableConfigurationProperties({ GoalCoachProperties.class, OpenAiProperties.class })
	static class Config {
	}

	@Test
	void emptyEnvironmentExamplesKeepSafeDefaults() {
		new ApplicationContextRunner().withUserConfiguration(Config.class)
			.withPropertyValues("app.goal.coach.free-daily-limit=", "app.goal.coach.daily-cap=",
					"app.ai.openai.api-key=", "app.ai.openai.model=", "app.ai.openai.base-url=")
			.run(context -> {
				assertThat(context).hasNotFailed();
				assertThat(context.getBean(GoalCoachProperties.class).freeDailyLimit()).isEqualTo(3);
				assertThat(context.getBean(GoalCoachProperties.class).dailyCap()).isEqualTo(300);
				assertThat(context.getBean(OpenAiProperties.class).configured()).isFalse();
				assertThat(context.getBean(OpenAiProperties.class).baseUrl()).isEqualTo("https://api.openai.com/v1");
			});
	}
}
