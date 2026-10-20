package com.flexable.web.auth;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.util.Base64;
import java.util.concurrent.ConcurrentHashMap;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.stereotype.Component;

/** 단일 서버용 저장소. 접근할 때 만료 항목을 정리한다. */
@Component
public class MemoryOAuthStore implements OAuthStore {
	private static final Logger log = LoggerFactory.getLogger(MemoryOAuthStore.class);
	private static final int MAX_STATES = 10_000;
	private static final int MAX_CODES = 10_000;
	private final int maxStates;
	private final int maxCodes;
	private final ConcurrentHashMap<String, State> states = new ConcurrentHashMap<>();
	private final ConcurrentHashMap<String, LoginCode> codes = new ConcurrentHashMap<>();
	private final SecureRandom random = new SecureRandom();
	private final Clock clock;

	@Autowired
	public MemoryOAuthStore(Clock clock) {
		this(clock, MAX_STATES, MAX_CODES);
	}

	MemoryOAuthStore(Clock clock, int maxStates, int maxCodes) {
		this.clock = clock;
		this.maxStates = maxStates;
		this.maxCodes = maxCodes;
	}
	// 상한 확인과 추가를 같은 잠금 안에서 처리해 동시 요청도 상한을 넘지 않게 한다.
	public synchronized String saveState(String provider, String redirectUri, String codeChallenge) {
		sweep();
		if (states.size() >= maxStates) {
			log.warn("소셜 로그인 state 저장 상한: count={}", states.size());
			return null;
		}
		String key = key();
		states.put(key, new State(provider, redirectUri, codeChallenge, clock.instant().plus(Duration.ofMinutes(10))));
		return key;
	}
	public State consumeState(String value) {
		sweep();
		State state = value == null ? null : states.remove(value);
		return state != null && state.expiresAt().isAfter(clock.instant()) ? state : null;
	}
	public synchronized String saveCode(long userId, String codeChallenge) {
		sweep();
		if (codes.size() >= maxCodes) {
			log.warn("소셜 로그인 code 저장 상한: count={}", codes.size());
			return null;
		}
		String key = key();
		codes.put(key, new LoginCode(userId, codeChallenge, clock.instant().plus(Duration.ofMinutes(2))));
		return key;
	}
	public LoginCode consumeCode(String value) {
		sweep();
		LoginCode code = value == null ? null : codes.remove(value);
		return code != null && code.expiresAt().isAfter(clock.instant()) ? code : null;
	}
	private String key() {
		byte[] bytes = new byte[32];
		random.nextBytes(bytes);
		return Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
	}
	private void sweep() {
		Instant now = clock.instant();
		states.entrySet().removeIf(e -> !e.getValue().expiresAt().isAfter(now));
		codes.entrySet().removeIf(e -> !e.getValue().expiresAt().isAfter(now));
	}
}
