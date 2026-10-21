package com.flexable.web.auth;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 웹 회원에 붙은 소셜 로그인 수단. 앱(project2)의 user_identities와는 다른 웹 DB 테이블이다. */
@Entity
@Table(name = "user_identities")
public class Identity {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "user_id", nullable = false)
	private Long userId;

	@Column(nullable = false, length = 20)
	private String provider;

	@Column(name = "provider_user_id", nullable = false, length = 100)
	private String providerUserId;

	@Column(length = 254)
	private String email;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected Identity() {
	}

	Identity(long userId, String provider, String providerUserId, String email, Instant now) {
		this.userId = userId;
		this.provider = provider;
		this.providerUserId = providerUserId;
		this.email = email;
		this.createdAt = now;
	}

	long getUserId() {
		return userId;
	}

	String getProvider() {
		return provider;
	}

	String getProviderUserId() {
		return providerUserId;
	}
}
