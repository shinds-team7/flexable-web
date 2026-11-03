package com.flexable.web.goalscenario;

import java.time.Instant;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 회원이 저장한 목표 시나리오(V22). snapshot은 저장할 때의 계산 결과 JSON이고 다시 계산하지 않는다. */
@Entity
@Table(name = "goal_scenarios")
class SavedScenario {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false)
	private long userId;

	@Column(name = "saved_at", nullable = false)
	private Instant savedAt;

	@Column(nullable = false, length = 20)
	private String name;

	@Column(name = "target_amount", nullable = false)
	private long targetAmount;

	@Column(nullable = false)
	private int years;

	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "json")
	private String snapshot;

	protected SavedScenario() {
	}

	SavedScenario(long userId, Instant savedAt, String name, long targetAmount, int years, String snapshot) {
		this.userId = userId;
		this.savedAt = savedAt;
		this.name = name;
		this.targetAmount = targetAmount;
		this.years = years;
		this.snapshot = snapshot;
	}

	Long getId() {
		return id;
	}

	long getUserId() {
		return userId;
	}

	Instant getSavedAt() {
		return savedAt;
	}

	String getName() {
		return name;
	}

	long getTargetAmount() {
		return targetAmount;
	}

	int getYears() {
		return years;
	}

	String getSnapshot() {
		return snapshot;
	}
}
