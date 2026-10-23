package com.flexable.web.engagement;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "goals")
public class Goal {
	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	Long id;
	@Column(name = "user_id", nullable = false, unique = true)
	long userId;
	@Column(nullable = false)
	int version;
	@Column(nullable = false, length = 20)
	String category;
	@Column(nullable = false, length = 20)
	String name;
	@Column(nullable = false)
	long amount;
	@Column(name = "due_month", nullable = false, columnDefinition = "char(7)")
	String dueMonth;
	@Column(name = "current_amount")
	Long currentAmount;
	@Column(name = "monthly_pace")
	Long monthlyPace;
	@Column(name = "created_at", nullable = false)
	Instant createdAt;
	@Column(name = "updated_at", nullable = false)
	Instant updatedAt;

	protected Goal() {
	}

	Goal(long userId, Instant now) {
		this.userId = userId;
		this.createdAt = now;
	}

	void change(GoalDtos.GoalInput input, Instant now) {
		version++;
		category = input.category();
		name = input.name().strip();
		amount = input.amount();
		dueMonth = input.dueMonth();
		currentAmount = input.currentAmount();
		monthlyPace = input.monthlyPace();
		updatedAt = now;
	}
}
