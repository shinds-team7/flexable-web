package com.flexable.web.applink;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Embeddable;

/** 앱에서 받은 주기별 반영 기록 한 건(app_link_entries). 연동 행과 함께 지워진다. */
@Embeddable
public class SeedEntry {

	@Column(name = "cycle_end", nullable = false)
	private LocalDate cycleEnd;

	@Column(name = "choice", nullable = false, length = 10)
	private String choice;

	@Column(name = "amount", nullable = false)
	private long amount;

	@Column(name = "total_after", nullable = false)
	private long totalAfter;

	@Column(name = "created_at")
	private Instant createdAt;

	protected SeedEntry() {
	}

	SeedEntry(AppApiClient.Entry e) {
		this.cycleEnd = e.cycleEnd();
		this.choice = e.choice();
		this.amount = e.amount();
		this.totalAfter = e.totalAfter();
		this.createdAt = e.createdAt() == null ? null : e.createdAt().toInstant();
	}

	LocalDate getCycleEnd() {
		return cycleEnd;
	}

	String getChoice() {
		return choice;
	}

	long getAmount() {
		return amount;
	}

	long getTotalAfter() {
		return totalAfter;
	}

	Instant getCreatedAt() {
		return createdAt;
	}
}
