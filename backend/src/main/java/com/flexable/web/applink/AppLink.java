package com.flexable.web.applink;

import java.time.Instant;
import java.time.LocalDate;

import com.flexable.web.applink.AppApiClient.AppProfile;
import com.flexable.web.applink.AppApiClient.AppSeedMoney;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/**
 * 웹 회원 ↔ 앱 연동(웹 회원당 하나). 앱에서 받은 회원 정보·시드머니는 마지막 값만 두고 연동과 함께 지운다.
 * syncedAt은 마지막 성공 조회, checkedAt은 마지막 조회 시도 시각, syncFailed는 마지막 조회가 실패했는지다.
 */
@Entity
@Table(name = "app_links")
public class AppLink {

	static final String SEED_OK = "ok";
	static final String SEED_BUDGET_NOT_SET = "budget_not_set";

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false, unique = true)
	private Long userId;

	@Column(name = "link_id_cipher", nullable = false)
	private String linkIdCipher;

	@Column(name = "app_email", length = 254)
	private String appEmail;

	@Column(name = "app_provider", nullable = false, length = 20)
	private String appProvider;

	@Column(name = "seed_state", length = 20)
	private String seedState;

	@Column(name = "seed_total")
	private Long seedTotal;

	@Column(name = "seed_base")
	private Long seedBase;

	@Column(name = "seed_monthly_goal")
	private Long seedMonthlyGoal;

	@Column(name = "seed_last_cycle_end")
	private LocalDate seedLastCycleEnd;

	@Column(name = "seed_last_choice", length = 10)
	private String seedLastChoice;

	@Column(name = "seed_last_amount")
	private Long seedLastAmount;

	@Column(name = "seed_last_created_at")
	private Instant seedLastCreatedAt;

	@Column(name = "seed_updated_at")
	private Instant seedUpdatedAt;

	@Column(name = "synced_at", nullable = false)
	private Instant syncedAt;

	@Column(name = "checked_at", nullable = false)
	private Instant checkedAt;

	@Column(name = "sync_failed", nullable = false)
	private boolean syncFailed;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected AppLink() {
	}

	AppLink(long userId, String linkIdCipher, AppProfile profile, Instant now) {
		this.userId = userId;
		this.linkIdCipher = linkIdCipher;
		this.appEmail = profile.email();
		this.appProvider = profile.provider();
		this.syncedAt = now;
		this.checkedAt = now;
		this.createdAt = now;
	}

	/** seed가 null이면 앱 예산 설정 전(BUDGET_NOT_SET)이다. */
	void synced(AppProfile profile, AppSeedMoney seed, Instant now) {
		this.appEmail = profile.email();
		this.appProvider = profile.provider();
		if (seed == null) {
			this.seedState = SEED_BUDGET_NOT_SET;
			this.seedTotal = null;
			this.seedBase = null;
			this.seedMonthlyGoal = null;
			this.seedLastCycleEnd = null;
			this.seedLastChoice = null;
			this.seedLastAmount = null;
			this.seedLastCreatedAt = null;
			this.seedUpdatedAt = null;
		}
		else {
			this.seedState = SEED_OK;
			this.seedTotal = seed.total();
			this.seedBase = seed.base();
			this.seedMonthlyGoal = seed.monthlyGoal();
			var last = seed.lastEntry();
			this.seedLastCycleEnd = last == null ? null : last.cycleEnd();
			this.seedLastChoice = last == null ? null : last.choice();
			this.seedLastAmount = last == null ? null : last.amount();
			this.seedLastCreatedAt = last == null || last.createdAt() == null ? null : last.createdAt().toInstant();
			this.seedUpdatedAt = seed.updatedAt() == null ? null : seed.updatedAt().toInstant();
		}
		this.syncedAt = now;
		this.checkedAt = now;
		this.syncFailed = false;
	}

	void checkFailed(Instant now) {
		this.checkedAt = now;
		this.syncFailed = true;
	}

	boolean stale() {
		return syncFailed;
	}

	Long getId() {
		return id;
	}

	String getLinkIdCipher() {
		return linkIdCipher;
	}

	String getAppEmail() {
		return appEmail;
	}

	String getAppProvider() {
		return appProvider;
	}

	String getSeedState() {
		return seedState;
	}

	Long getSeedTotal() {
		return seedTotal;
	}

	Long getSeedBase() {
		return seedBase;
	}

	Long getSeedMonthlyGoal() {
		return seedMonthlyGoal;
	}

	LocalDate getSeedLastCycleEnd() {
		return seedLastCycleEnd;
	}

	String getSeedLastChoice() {
		return seedLastChoice;
	}

	Long getSeedLastAmount() {
		return seedLastAmount;
	}

	Instant getSeedLastCreatedAt() {
		return seedLastCreatedAt;
	}

	Instant getSeedUpdatedAt() {
		return seedUpdatedAt;
	}

	Instant getSyncedAt() {
		return syncedAt;
	}

	Instant getCheckedAt() {
		return checkedAt;
	}

	Instant getCreatedAt() {
		return createdAt;
	}
}
