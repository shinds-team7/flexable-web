package com.flexable.web.news;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** 소식 열람 기록의 30일 보관 기간을 지킨다. api에서 매일 정리한다. */
@Configuration
@Profile("!worker")
@EnableScheduling
public class NewsViewCleanupJob {
	private static final Logger log = LoggerFactory.getLogger(NewsViewCleanupJob.class);
	private final NewsViewService views;

	public NewsViewCleanupJob(NewsViewService views) {
		this.views = views;
	}

	@Scheduled(cron = "${app.news.view-cleanup-cron:0 50 3 * * *}", zone = "Asia/Seoul")
	void run() {
		int removed = views.deleteExpired();
		log.info("소식 열람 기록 일일 정리 완료: 만료된 기록 {}건", removed);
	}
}
