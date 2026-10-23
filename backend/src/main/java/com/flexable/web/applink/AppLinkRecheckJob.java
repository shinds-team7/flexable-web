package com.flexable.web.applink;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 앱에서 해제한 연동을 웹이 늦어도 하루 안에 알도록 매일 한 번 모든 연동을 확인한다(api 프로세스에서만, worker는 앱 서버를 부르지 않음).
 * 앱 서버 설정이 없으면 아무것도 하지 않는다.
 */
@Configuration
@Profile("!worker")
@EnableScheduling
public class AppLinkRecheckJob {

	private static final Logger log = LoggerFactory.getLogger(AppLinkRecheckJob.class);

	private final AppLinkService appLinks;
	private final AppApiClient app;

	public AppLinkRecheckJob(AppLinkService appLinks, AppApiClient app) {
		this.appLinks = appLinks;
		this.app = app;
	}

	@Scheduled(cron = "${app.applink.recheck-cron:0 20 3 * * *}", zone = "Asia/Seoul")
	void run() {
		if (!app.enabled()) {
			return;
		}
		int removed = appLinks.recheckAll();
		log.info("앱 연동 일일 확인 완료: 해제 확인 {}건", removed);
	}
}
