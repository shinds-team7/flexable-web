package com.flexable.web.engagement;

import java.time.Instant;

import org.hibernate.annotations.JdbcTypeCode;
import org.hibernate.type.SqlTypes;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "goal_coaches")
public class GoalCoach {
	@Id
	@Column(name = "user_id")
	long userId;
	@Column(name = "goal_id", nullable = false)
	long goalId;
	@Column(name = "goal_version", nullable = false)
	int goalVersion;
	@Column(name = "facts_hash", nullable = false, columnDefinition = "char(64)")
	String factsHash;
	@Column(name = "ai_generated", nullable = false)
	boolean aiGenerated;
	@Column(length = 100)
	String model;
	@Column(name = "fallback_reason", length = 30)
	String fallbackReason;
	@JdbcTypeCode(SqlTypes.JSON)
	@Column(nullable = false, columnDefinition = "json")
	String content;
	@Column(name = "requested_at", nullable = false)
	Instant requestedAt;
	@Column(name = "generated_at", nullable = false)
	Instant generatedAt;

	protected GoalCoach() {
	}
}
