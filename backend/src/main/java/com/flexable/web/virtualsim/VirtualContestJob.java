package com.flexable.web.virtualsim;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

/**
 * 대회 1분 정리·판정(decisions/2026-11-05-virtual-sim-contest 5-5·6-2). 세션이 api 메모리에 있으므로 api에서만 돈다(worker에서 돌면 모든 진행 중 판을
 * 세션 없는 판으로 정산해 버린다). 켤 때 바로 한 번 돌아 서버 재시작으로 세션이 사라진 판을 정산한다.
 */
@Configuration
@Profile("!worker")
@EnableScheduling
@ConditionalOnProperty(prefix = "app.virtual-sim.contest", name = "job-enabled", havingValue = "true", matchIfMissing = true)
public class VirtualContestJob {

	private static final Logger log = LoggerFactory.getLogger(VirtualContestJob.class);
	private final VirtualContestService service;

	public VirtualContestJob(VirtualContestService service) {
		this.service = service;
	}

	@Scheduled(initialDelay = 0, fixedDelay = 60000)
	void run() {
		try {
			service.tick();
		}
		catch (RuntimeException e) {
			log.error("대회 정리 작업 실패", e);
		}
	}
}
