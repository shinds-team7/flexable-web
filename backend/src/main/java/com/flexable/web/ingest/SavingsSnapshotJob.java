package com.flexable.web.ingest;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.boot.context.event.ApplicationReadyEvent;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.event.EventListener;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;

import com.flexable.web.deposit.DepositCatalogService;
import com.flexable.web.savings.FinlifeCompanyCatalog;
import com.flexable.web.savings.SavingsCatalogService;

/**
 * 적금·정기예금·금융회사 공시(finlife)와 적금 계열 청년정책(온통청년) 수집(savings-snapshot, 04 §8). 매일 10:00(KST)에 받아 로컬 DB를 갱신하고,
 * 시작할 때 DB가 비어 있으면 한 번 바로 받는다. 실패해도 기존 데이터는 그대로 두고 다음 주기에 다시 시도한다.
 * app.ingest.savings.enabled=true일 때만 켜지고(worker 프로필 기본 켜짐), 인증키가 없으면 건너뛴다.
 */
@Configuration
@EnableScheduling
@ConditionalOnProperty(prefix = "app.ingest.savings", name = "enabled", havingValue = "true")
public class SavingsSnapshotJob {

	private static final Logger log = LoggerFactory.getLogger(SavingsSnapshotJob.class);

	private final FinlifeClient finlife;
	private final YouthCenterClient youthCenter;
	private final SavingsCatalogService catalog;
	private final DepositCatalogService deposits;
	private final FinlifeCompanyCatalog companies;

	SavingsSnapshotJob(FinlifeClient finlife, YouthCenterClient youthCenter, SavingsCatalogService catalog,
			DepositCatalogService deposits, FinlifeCompanyCatalog companies) {
		this.finlife = finlife;
		this.youthCenter = youthCenter;
		this.catalog = catalog;
		this.deposits = deposits;
		this.companies = companies;
	}

	@EventListener(ApplicationReadyEvent.class)
	void onStart() {
		if (catalog.count() == 0) {
			sync();
		}
		if (deposits.count() == 0) {
			syncDeposits();
		}
		if (companies.count() == 0) {
			syncCompanies();
		}
		if (catalog.policyCount() == 0) {
			syncPolicies();
		}
	}

	@Scheduled(cron = "0 0 10 * * *", zone = "Asia/Seoul")
	void daily() {
		sync();
		syncDeposits();
		syncCompanies();
		syncPolicies();
	}

	synchronized void sync() {
		if (!finlife.configured()) {
			log.warn("FINLIFE_API_KEY가 없어 적금 공시 수집을 건너뜁니다");
			return;
		}
		try {
			int n = catalog.replaceAll(finlife.fetchAll());
			log.info("적금 공시 {}개를 반영했습니다", n);
		}
		catch (RuntimeException e) {
			log.error("적금 공시 수집 실패, 기존 데이터를 유지합니다: {}", e.getMessage());
		}
	}

	/** 정기예금은 적금과 따로 받아서, 한쪽이 실패해도 다른 쪽 데이터는 그대로 둔다. */
	synchronized void syncDeposits() {
		if (!finlife.configured()) {
			log.warn("FINLIFE_API_KEY가 없어 정기예금 공시 수집을 건너뜁니다");
			return;
		}
		try {
			int n = deposits.replaceAll(finlife.fetchAllDeposits());
			log.info("정기예금 공시 {}개를 반영했습니다", n);
		}
		catch (RuntimeException e) {
			log.error("정기예금 공시 수집 실패, 기존 데이터를 유지합니다: {}", e.getMessage());
		}
	}

	/** 금융회사 홈페이지(상품 상세 링크용, #449). 상품과 따로 받아서 실패해도 상품 데이터와 기존 주소는 그대로 둔다. */
	synchronized void syncCompanies() {
		if (!finlife.configured()) {
			log.warn("FINLIFE_API_KEY가 없어 금융회사 공시 수집을 건너뜁니다");
			return;
		}
		try {
			int n = companies.replaceAll(finlife.fetchCompanies());
			log.info("금융회사 공시 {}곳을 반영했습니다", n);
		}
		catch (RuntimeException e) {
			log.error("금융회사 공시 수집 실패, 기존 데이터를 유지합니다: {}", e.getMessage());
		}
	}

	synchronized void syncPolicies() {
		if (!youthCenter.configured()) {
			log.warn("YOUTHCENTER_API_KEY가 없어 청년정책 수집을 건너뜁니다");
			return;
		}
		try {
			int n = catalog.replacePolicies(youthCenter.fetchAll());
			log.info("청년정책 {}개를 반영했습니다", n);
		}
		catch (RuntimeException e) {
			log.error("청년정책 수집 실패, 기존 데이터를 유지합니다: {}", e.getMessage());
		}
	}
}
