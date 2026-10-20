package com.flexable.web.auth;

import java.time.Instant;

/** state와 교환 코드는 조회와 동시에 소비한다. */
public interface OAuthStore {
	/** 저장 상한이면 null을 반환한다. */
	String saveState(String provider, String redirectUri, String codeChallenge);
	State consumeState(String value);
	/** 저장 상한이면 null을 반환한다. */
	String saveCode(long userId, String codeChallenge);
	LoginCode consumeCode(String value);
	public record State(String provider, String redirectUri, String codeChallenge, Instant expiresAt) {
	}
	public record LoginCode(long userId, String codeChallenge, Instant expiresAt) {
	}
}
