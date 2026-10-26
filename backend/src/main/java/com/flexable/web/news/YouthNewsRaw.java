package com.flexable.web.news;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 수집 원문 한 건. 받은 그대로 두고, 바뀌었는지는 contentHash로 본다. */
@Entity
@Table(name = "youth_news_raw")
class YouthNewsRaw {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(nullable = false, length = 20)
	private String source;

	@Column(name = "external_id", nullable = false, length = 60)
	private String externalId;

	@Column(nullable = false, columnDefinition = "TEXT")
	private String payload;

	@Column(name = "content_hash", nullable = false, length = 64)
	private String contentHash;

	@Column(name = "fetched_at", nullable = false)
	private Instant fetchedAt;

	protected YouthNewsRaw() {
	}

	YouthNewsRaw(String source, String externalId) {
		this.source = source;
		this.externalId = externalId;
	}

	void update(String payload, String contentHash, Instant now) {
		this.payload = payload;
		this.contentHash = contentHash;
		this.fetchedAt = now;
	}

	Long getId() {
		return id;
	}

	String getContentHash() {
		return contentHash;
	}
}
