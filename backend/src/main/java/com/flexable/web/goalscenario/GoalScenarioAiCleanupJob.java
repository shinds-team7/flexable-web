package com.flexable.web.goalscenario;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** 목표 시나리오 AI 횟수·재사용 초안의 7일 보관 기간을 지킨다(방침 제4조). 키 유무와 관계없이 api에서 매일 정리한다. */
@Configuration
@Profile("!worker")
@EnableScheduling
public class GoalScenarioAiCleanupJob {
	private static final Logger log = LoggerFactory.getLogger(GoalScenarioAiCleanupJob.class);
	private final ScenarioAiQuota quota;

	GoalScenarioAiCleanupJob(ScenarioAiQuota quota) {
		this.quota = quota;
	}

	@Scheduled(cron = "${app.goal.scenario.ai.cleanup-cron:0 45 3 * * *}", zone = "Asia/Seoul")
	void run() {
		int removed = quota.deleteExpired();
		log.info("목표 시나리오 AI 일일 정리 완료: 만료된 행 {}건", removed);
	}
}
