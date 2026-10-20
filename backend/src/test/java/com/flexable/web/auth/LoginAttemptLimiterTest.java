package com.flexable.web.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;

import org.junit.jupiter.api.Test;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;

class LoginAttemptLimiterTest {

	static class MutableClock extends Clock {
		Instant now = Instant.parse("2026-10-20T00:00:00Z");

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return this;
		}

		@Override
		public Instant instant() {
			return now;
		}

		void advance(Duration d) {
			now = now.plus(d);
		}
	}

	@Test
	void blocksAfterMaxFailuresUntilWindowPasses() {
		MutableClock clock = new MutableClock();
		LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock);
		for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
			limiter.check("a@example.com");
			limiter.recordFailure("a@example.com");
		}
		assertThatThrownBy(() -> limiter.check("a@example.com")).isInstanceOf(ApiException.class)
			.satisfies(e -> {
				ApiException api = (ApiException) e;
				assertThat(api.code()).isEqualTo(ErrorCode.TOO_MANY_ATTEMPTS);
				assertThat((Long) api.extra().get("retryAfterSeconds")).isEqualTo(600L);
			});
		limiter.check("b@example.com");

		clock.advance(LoginAttemptLimiter.WINDOW.plusSeconds(1));
		limiter.check("a@example.com");
		assertThat(limiter.size()).isZero();
	}

	@Test
	void successResetsFailures() {
		LoginAttemptLimiter limiter = new LoginAttemptLimiter(new MutableClock());
		for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES - 1; i++) {
			limiter.recordFailure("a@example.com");
		}
		limiter.reset("a@example.com");
		limiter.recordFailure("a@example.com");
		limiter.check("a@example.com");
	}

	@Test
	void sweepDropsStaleEmails() {
		MutableClock clock = new MutableClock();
		LoginAttemptLimiter limiter = new LoginAttemptLimiter(clock);
		limiter.recordFailure("old@example.com");
		clock.advance(LoginAttemptLimiter.WINDOW.plusSeconds(1));
		limiter.recordFailure("new@example.com");
		assertThat(limiter.size()).isEqualTo(1);
	}
}
