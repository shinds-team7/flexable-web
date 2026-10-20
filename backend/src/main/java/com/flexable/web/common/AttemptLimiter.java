package com.flexable.web.common;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.ArrayDeque;
import java.util.Deque;
import java.util.Map;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.atomic.AtomicReference;

/**
 * 키(이메일·회원 id)별 실패 횟수 제한. 웹 백엔드는 VM 한 대에 api 하나만 뜨므로 메모리 구현으로 둔다.
 * 기록은 Map의 compute 안에서만 읽고 바꿔 정리와 추가가 겹치지 않게 하고, 비면 키를 지운다.
 * 다시 조회되지 않는 키도 남지 않도록 window마다 전체를 한 번 정리한다.
 */
public class AttemptLimiter {

	private final int maxFailures;
	private final Duration window;
	private final Map<String, Deque<Instant>> failures = new ConcurrentHashMap<>();
	private final AtomicReference<Instant> lastSweep;
	private final Clock clock;

	public AttemptLimiter(int maxFailures, Duration window, Clock clock) {
		this.maxFailures = maxFailures;
		this.window = window;
		this.clock = clock;
		this.lastSweep = new AtomicReference<>(clock.instant());
	}

	/** 한도를 넘었으면 TOO_MANY_ATTEMPTS(+retryAfterSeconds). */
	public void check(String key) {
		Instant now = clock.instant();
		Instant[] blockedSince = new Instant[1];
		failures.computeIfPresent(key, (k, q) -> {
			prune(q, now);
			if (q.size() >= maxFailures) {
				blockedSince[0] = q.peekFirst();
			}
			return q.isEmpty() ? null : q;
		});
		if (blockedSince[0] != null) {
			long retryAfter = Math.max(1, Duration.between(now, blockedSince[0].plus(window)).toSeconds());
			throw new ApiException(ErrorCode.TOO_MANY_ATTEMPTS, ErrorCode.TOO_MANY_ATTEMPTS.message(),
					Map.of("retryAfterSeconds", retryAfter));
		}
	}

	public void recordFailure(String key) {
		Instant now = clock.instant();
		failures.compute(key, (k, q) -> {
			Deque<Instant> d = q == null ? new ArrayDeque<>() : q;
			prune(d, now);
			d.addLast(now);
			return d;
		});
		sweepIfDue(now);
	}

	public void reset(String key) {
		failures.remove(key);
	}

	public int size() {
		return failures.size();
	}

	private void sweepIfDue(Instant now) {
		Instant last = lastSweep.get();
		if (last.plus(window).isAfter(now) || !lastSweep.compareAndSet(last, now)) {
			return;
		}
		for (String key : failures.keySet()) {
			failures.computeIfPresent(key, (k, q) -> {
				prune(q, now);
				return q.isEmpty() ? null : q;
			});
		}
	}

	private void prune(Deque<Instant> q, Instant now) {
		while (!q.isEmpty() && q.peekFirst().plus(window).isBefore(now)) {
			q.pollFirst();
		}
	}
}
