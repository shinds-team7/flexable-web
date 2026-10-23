package com.flexable.web.engagement;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** 회원별 AI 요청 횟수의 7일 보관 기간을 지킨다. 키 유무와 관계없이 api에서 매일 정리한다. */
@Configuration
@Profile("!worker")
@EnableScheduling
public class GoalCoachUsageCleanupJob {
	private static final Logger log = LoggerFactory.getLogger(GoalCoachUsageCleanupJob.class);
	private final GoalCoachQuota quota;

	public GoalCoachUsageCleanupJob(GoalCoachQuota quota) {
		this.quota = quota;
	}

	@Scheduled(cron = "${app.goal.coach.cleanup-cron:0 40 3 * * *}", zone = "Asia/Seoul")
	void run() {
		int removed = quota.deleteExpiredUsage();
		log.info("목표 안내 일일 정리 완료: 만료된 회원별 사용량 {}건", removed);
	}
}
