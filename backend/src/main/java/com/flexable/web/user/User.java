package com.flexable.web.user;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

@Entity
@Table(name = "users")
public class User {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(unique = true, length = 254)
	private String email;

	@Column(name = "terms_agreed_at", nullable = false)
	private Instant termsAgreedAt;

	/** 2026-10-21 전 가입자의 개인정보 수집·이용 동의(필수) 시각. 이후 가입자는 동의 대신 방침 안내라 null(V7) */
	@Column(name = "privacy_agreed_at")
	private Instant privacyAgreedAt;

	@Column(name = "created_at", nullable = false)
	private Instant createdAt;

	protected User() {
	}

	User(String email, Instant now) {
		this.email = email;
		this.termsAgreedAt = now;
		this.createdAt = now;
	}

	public Long getId() {
		return id;
	}

	public String getEmail() {
		return email;
	}

	public Instant getCreatedAt() {
		return createdAt;
	}
}
