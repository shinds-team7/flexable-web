package com.flexable.web.engagement;

import java.time.OffsetDateTime;
import java.util.List;

import com.flexable.web.ai.GoalCoachClient.Content;
import com.flexable.web.common.WholeWonDeserializer;

import tools.jackson.databind.annotation.JsonDeserialize;

public final class GoalDtos {

	private GoalDtos() {
	}

	public record GoalInput(String category, String name,
			@JsonDeserialize(using = WholeWonDeserializer.class) Long amount, String dueMonth,
			@JsonDeserialize(using = WholeWonDeserializer.class) Long currentAmount,
			@JsonDeserialize(using = WholeWonDeserializer.class) Long monthlyPace) {
	}

	public record AiStatus(boolean available, String plan, int limitPerDay, int remainingToday) {
	}

	public record GoalResponse(GoalView goal, AiStatus ai) {
	}

	public record CoachResponse(Coach coach, AiStatus ai) {
	}

	public record Seed(String source, long current, Long pace, OffsetDateTime asOf, String appStatus) {
	}

	public record Progress(String thisMonth, long current, long remaining, int ratioBp, long monthsLeft,
			Long requiredMonthly, Long expectedMonths, String expectedMonth, String status, long monthlyGap,
			long dailyGap) {
	}

	public record Scenario(String key, long monthly, String reachMonth) {
	}

	public record Checkpoint(int percent, String month, long target) {
	}

	public record Calculation(Progress progress, List<Scenario> scenarios, List<Checkpoint> checkpoints) {
	}

	public record GoalView(long id, int version, String category, String name, long amount, String dueMonth,
			Long currentAmount, Long monthlyPace, OffsetDateTime createdAt, OffsetDateTime updatedAt, Seed seed,
			Progress progress, List<Scenario> scenarios, List<Checkpoint> checkpoints, Coach coach) {
	}

	public record Coach(boolean aiGenerated, String model, String fallbackReason, OffsetDateTime generatedAt,
			boolean stale, String headline, String summary, List<Content.Step> steps, String noticeKey, String notice) {
	}
}
