package com.flexable.web.guide;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** 글 열람 방문자 기록의 30일 보관 기간을 지킨다. 글별 합계는 지우지 않는다. api에서 매일 정리한다. */
@Configuration
@Profile("!worker")
@EnableScheduling
public class GuideContentViewCleanupJob {
	private static final Logger log = LoggerFactory.getLogger(GuideContentViewCleanupJob.class);
	private final GuideContentViewService views;

	public GuideContentViewCleanupJob(GuideContentViewService views) {
		this.views = views;
	}

	@Scheduled(cron = "${app.guide.view-cleanup-cron:0 55 3 * * *}", zone = "Asia/Seoul")
	void run() {
		int removed = views.deleteExpired();
		log.info("금융 가이드 열람 기록 일일 정리 완료: 만료된 기록 {}건", removed);
	}
}
