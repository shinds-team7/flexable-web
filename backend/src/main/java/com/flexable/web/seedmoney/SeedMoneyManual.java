package com.flexable.web.seedmoney;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** seed_money_manual. 웹에서 직접 고친 시드머니(회원당 하나). 이 패키지 밖에서 쓰지 않는다. */
@Entity
@Table(name = "seed_money_manual")
class SeedMoneyManual {
	@Id
	@Column(name = "user_id")
	Long userId;
	@Column(nullable = false)
	long total;
	@Column(name = "updated_at", nullable = false)
	Instant updatedAt;

	protected SeedMoneyManual() {
	}

	SeedMoneyManual(long userId) {
		this.userId = userId;
	}

	void change(long total, Instant now) {
		this.total = total;
		this.updatedAt = now;
	}
}
