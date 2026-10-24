package com.flexable.web.engagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.verify;

import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;
import org.springframework.boot.test.context.runner.ApplicationContextRunner;
import org.springframework.scheduling.annotation.ScheduledAnnotationBeanPostProcessor;
import org.springframework.scheduling.config.CronTask;
import org.springframework.scheduling.support.SimpleTriggerContext;

class GoalCoachUsageCleanupJobTest {
	private final GoalCoachQuota quota = mock(GoalCoachQuota.class);
	private final ApplicationContextRunner runner = new ApplicationContextRunner()
		.withBean(GoalCoachQuota.class, () -> quota)
		.withUserConfiguration(GoalCoachUsageCleanupJob.class);

	@Test
	void apiRegistersDailySeoulScheduleAndRunsCleanup() {
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("api")).run(context -> {
			assertThat(context).hasSingleBean(GoalCoachUsageCleanupJob.class);
			var tasks = context.getBean(ScheduledAnnotationBeanPostProcessor.class).getScheduledTasks();
			assertThat(tasks).hasSize(1);
			var task = (CronTask) tasks.iterator().next().getTask();
			assertThat(task.getExpression()).isEqualTo("0 40 3 * * *");
			var triggerContext = new SimpleTriggerContext(Clock.fixed(Instant.parse("2026-10-22T18:39:59Z"), ZoneOffset.UTC));
			assertThat(task.getTrigger().nextExecution(triggerContext)).isEqualTo(Instant.parse("2026-10-22T18:40:00Z"));
			context.getBean(GoalCoachUsageCleanupJob.class).run();
			verify(quota).deleteExpiredUsage();
		});
	}

	@Test
	void defaultApiProcessAlsoRegistersButWorkerNeverDoes() {
		runner.run(context -> assertThat(context).hasSingleBean(GoalCoachUsageCleanupJob.class));
		runner.withInitializer(context -> context.getEnvironment().setActiveProfiles("worker"))
			.run(context -> assertThat(context).doesNotHaveBean(GoalCoachUsageCleanupJob.class));
	}
}
