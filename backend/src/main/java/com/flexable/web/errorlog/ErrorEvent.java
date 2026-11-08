package com.flexable.web.errorlog;

import java.time.Instant;
import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 오류 기록 한 줄. 같은 날 같은 fingerprint는 한 줄로 묶고 occurrences만 올린다(V31). */
@Entity
@Table(name = "error_events")
public class ErrorEvent {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "event_day", nullable = false)
	private LocalDate day;

	@Column(nullable = false, length = 64)
	private String fingerprint;

	@Column(nullable = false, length = 10)
	private String source;

	@Column(nullable = false, length = 10)
	private String kind;

	@Column(name = "user_id")
	private Long userId;

	@Column(name = "app_version", length = 20)
	private String appVersion;

	@Column(length = 10)
	private String platform;

	@Column(length = 100)
	private String screen;

	@Column(length = 10)
	private String method;

	@Column(length = 200)
	private String path;

	private Integer status;

	@Column(length = 40)
	private String code;

	@Column(nullable = false, length = 500)
	private String message;

	@Column(length = 4000)
	private String stack;

	@Column(nullable = false)
	private int occurrences;

	@Column(name = "first_at", nullable = false)
	private Instant firstAt;

	@Column(name = "last_at", nullable = false)
	private Instant lastAt;

	protected ErrorEvent() {
	}

	ErrorEvent(LocalDate day, String fingerprint, ErrorReport r, Instant now) {
		this.day = day;
		this.fingerprint = fingerprint;
		this.source = r.source().name();
		this.kind = r.kind().name();
		this.userId = r.userId();
		this.appVersion = r.appVersion();
		this.platform = r.platform();
		this.screen = r.screen();
		this.method = r.method();
		this.path = r.path();
		this.status = r.status();
		this.code = r.code();
		this.message = r.message();
		this.stack = r.stack();
		this.occurrences = 1;
		this.firstAt = now;
		this.lastAt = now;
	}

	/** 같은 오류가 또 났다. 마지막으로 겪은 회원·버전을 남긴다. */
	void hit(ErrorReport r, Instant now) {
		this.occurrences++;
		this.lastAt = now;
		if (r.userId() != null) {
			this.userId = r.userId();
		}
		if (r.appVersion() != null) {
			this.appVersion = r.appVersion();
		}
	}
}
