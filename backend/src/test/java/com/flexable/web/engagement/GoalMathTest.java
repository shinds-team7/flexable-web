package com.flexable.web.engagement;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.YearMonth;

import org.junit.jupiter.api.Test;

import com.flexable.web.engagement.GoalDtos.Checkpoint;

class GoalMathTest {
	private static final YearMonth NOW = YearMonth.of(2026, 10);

	@Test
	void contractExampleIncludingAllCheckpoints() {
		var result = GoalMath.calculate(1_000_000, 470_000, 78_000L, NOW.plusMonths(12), NOW);
		var p = result.progress();
		assertThat(p.current()).isEqualTo(470000);
		assertThat(p.remaining()).isEqualTo(530000);
		assertThat(p.ratioBp()).isEqualTo(4700);
		assertThat(p.monthsLeft()).isEqualTo(12);
		assertThat(p.requiredMonthly()).isEqualTo(45000);
		assertThat(p.expectedMonths()).isEqualTo(7);
		assertThat(p.expectedMonth()).isEqualTo("2027-05");
		assertThat(p.status()).isEqualTo("ON_TRACK");
		assertThat(result.scenarios()).extracting("monthly").containsExactly(78000L, 45000L, 30000L);
		assertThat(result.scenarios()).extracting("reachMonth").containsExactly("2027-05", "2027-10", "2028-04");
		assertThat(result.checkpoints()).containsExactly(new Checkpoint(25, "2027-01", 602500),
				new Checkpoint(50, "2027-04", 735000), new Checkpoint(75, "2027-07", 867500), new Checkpoint(100, "2027-10", 1000000));
	}

	@Test
	void reachedTakesPrecedenceEvenWhenOverdueAndCapsRatio() {
		var result = GoalMath.calculate(10000, 20000, null, NOW.minusMonths(1), NOW);
		assertThat(result.progress().status()).isEqualTo("REACHED");
		assertThat(result.progress().ratioBp()).isEqualTo(10000);
		assertThat(result.progress().requiredMonthly()).isZero();
		assertThat(result.progress().expectedMonths()).isZero();
		assertThat(result.scenarios()).isEmpty();
		assertThat(result.checkpoints()).isEmpty();
	}

	@Test
	void nullAndZeroPaceOmitKeepScenario() {
		for (Long pace : new Long[] { null, 0L }) {
			var result = GoalMath.calculate(10000, 0, pace, NOW.plusMonths(1), NOW);
			assertThat(result.progress().status()).isEqualTo("NO_PACE");
			assertThat(result.progress().expectedMonth()).isNull();
			assertThat(result.scenarios()).extracting("key").containsExactly("MEET_DUE", "EXTEND_6");
		}
	}

	@Test
	void behindRoundsMonthlyAndDailyGapsUp() {
		var p = GoalMath.calculate(1_000_001, 0, 30000L, NOW.plusMonths(12), NOW).progress();
		assertThat(p.status()).isEqualTo("BEHIND");
		assertThat(p.requiredMonthly()).isEqualTo(84000);
		assertThat(p.monthlyGap()).isEqualTo(54000);
		assertThat(p.dailyGap()).isEqualTo(1800);
		assertThat(GoalMath.calculate(10000, 0, 1L, NOW.plusMonths(1), NOW).progress().dailyGap()).isEqualTo(400);
	}

	@Test
	void overdueOmitsDueAndCheckpointsAndExtendsFromNow() {
		var result = GoalMath.calculate(100000, 0, 10000L, NOW.minusMonths(2), NOW);
		assertThat(result.progress().monthsLeft()).isEqualTo(-2);
		assertThat(result.progress().status()).isEqualTo("OVERDUE");
		assertThat(result.progress().requiredMonthly()).isNull();
		assertThat(result.scenarios()).extracting("key").containsExactly("KEEP_PACE", "EXTEND_6");
		assertThat(result.scenarios().getLast().monthly()).isEqualTo(17000);
		assertThat(result.scenarios().getLast().reachMonth()).isEqualTo("2027-04");
		assertThat(result.checkpoints()).isEmpty();
	}

	@Test
	void dueThisMonthAndRoundingNeverPushCheckpointsPastDue() {
		var result = GoalMath.calculate(10001, 10000, 1L, NOW, NOW);
		assertThat(result.progress().requiredMonthly()).isEqualTo(1000);
		assertThat(result.progress().status()).isEqualTo("ON_TRACK");
		assertThat(result.checkpoints()).allSatisfy(c -> assertThat(c.month()).isEqualTo(NOW.toString()));
		assertThat(result.checkpoints().getLast().target()).isEqualTo(10001);
	}

	@Test
	void upperAmountsUseLongArithmetic() {
		var result = GoalMath.calculate(1_000_000_000, 999_999_999, 100_000_000L, NOW.plusMonths(1), NOW);
		assertThat(result.progress().ratioBp()).isEqualTo(9999);
		assertThat(result.progress().requiredMonthly()).isEqualTo(1000);
		assertThat(result.checkpoints().getLast().target()).isEqualTo(1_000_000_000);
	}
}
