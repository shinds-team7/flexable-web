package com.flexable.web.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 웹 회원의 비밀번호와 토큰 버전. 회원 정보(이메일·동의)는 user 패키지가 가진다. */
@Entity
@Table(name = "user_credentials")
public class Credential {

	@Id
	@Column(name = "user_id")
	private Long userId;

	@Column(name = "password_hash", nullable = false, length = 100)
	private String passwordHash;

	@Column(name = "token_version", nullable = false)
	private int tokenVersion;

	@Column(name = "updated_at", nullable = false)
	private Instant updatedAt;

	protected Credential() {
	}

	Credential(long userId, String passwordHash, Instant now) {
		this.userId = userId;
		this.passwordHash = passwordHash;
		this.updatedAt = now;
	}

	long getUserId() {
		return userId;
	}

	String getPasswordHash() {
		return passwordHash;
	}

	int getTokenVersion() {
		return tokenVersion;
	}

	/** 이 회원에게 발급한 웹 토큰을 모두 무효로 만든다. */
	void revokeTokens(Instant now) {
		this.tokenVersion++;
		this.updatedAt = now;
	}
}
