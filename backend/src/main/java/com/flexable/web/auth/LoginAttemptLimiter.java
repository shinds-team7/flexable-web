package com.flexable.web.auth;

import java.time.Clock;
import java.time.Duration;

import org.springframework.stereotype.Component;

import com.flexable.web.common.AttemptLimiter;

/** 이메일별 로그인 실패 제한(10분 내 5회). 동작은 common.AttemptLimiter. */
@Component
public class LoginAttemptLimiter extends AttemptLimiter {

	static final int MAX_FAILURES = 5;
	static final Duration WINDOW = Duration.ofMinutes(10);

	public LoginAttemptLimiter(Clock clock) {
		super(MAX_FAILURES, WINDOW, clock);
	}
}
