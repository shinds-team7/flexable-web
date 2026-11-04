package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.List;

import org.junit.jupiter.api.Test;

import com.flexable.web.goalscenario.GoalScenarioDtos.Result;

class ScenarioResultCacheTest {

	/** 시각을 옮길 수 있는 시계. */
	static final class MovableClock extends Clock {
		Instant now = Instant.parse("2026-11-03T00:00:00Z");

		@Override
		public ZoneId getZone() {
			return ZoneId.of("UTC");
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	private static Result result() {
		return new Result(null, "목돈", 15_000_000, 1, 12, "DEMO", "AI_UNAVAILABLE", LocalDate.of(2026, 11, 3), "2021-10", "2026-10", 2000,
				20261103L, new BigDecimal("0.8"), List.of(), List.of(), List.of(), "고지", true, null, false);
	}

	@Test
	void 삼십_분_동안만_기억한다() {
		MovableClock clock = new MovableClock();
		ScenarioResultCache cache = new ScenarioResultCache(clock);
		Result r = cache.remember(result());
		assertThat(r.resultId()).isNotBlank();
		assertThat(cache.find(r.resultId())).contains(r);
		clock.now = clock.now.plus(ScenarioResultCache.TTL).minusSeconds(1);
		assertThat(cache.find(r.resultId())).isPresent();
		clock.now = clock.now.plusSeconds(1);
		assertThat(cache.find(r.resultId())).isEmpty();
		assertThat(cache.find(null)).isEmpty();
	}

	@Test
	void 많아지면_먼저_끝나는_것부터_버린다() {
		MovableClock clock = new MovableClock();
		ScenarioResultCache cache = new ScenarioResultCache(clock);
		Result first = cache.remember(result());
		for (int i = 1; i < ScenarioResultCache.MAX; i++) {
			clock.now = clock.now.plusMillis(1);
			cache.remember(result());
		}
		assertThat(cache.find(first.resultId())).isPresent();
		clock.now = clock.now.plusMillis(1);
		Result last = cache.remember(result());
		assertThat(cache.find(first.resultId())).isEmpty();
		assertThat(cache.find(last.resultId())).isPresent();
	}
}
