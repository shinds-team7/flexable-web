package com.flexable.web.errorlog;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/** 오류 기록의 30일 보관 기간을 지킨다. api에서 매일 정리한다. */
@Configuration
@Profile("!worker")
@EnableScheduling
public class ErrorEventCleanupJob {

	private static final Logger log = LoggerFactory.getLogger(ErrorEventCleanupJob.class);
	private final ErrorEventService events;

	public ErrorEventCleanupJob(ErrorEventService events) {
		this.events = events;
	}

	@Scheduled(cron = "${app.errorlog.cleanup-cron:0 30 4 * * *}", zone = "Asia/Seoul")
	void run() {
		int removed = events.deleteExpired();
		log.info("오류 기록 일일 정리 완료: 30일 지난 기록 {}줄", removed);
	}
}
