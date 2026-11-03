package com.flexable.web.news;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 소식 열람 한 줄: (소식, 방문자, 날짜)당 하나. 방문자 값은 브라우저가 만든 임의 UUID라 계정과 이어지지 않는다. */
@Entity
@Table(name = "youth_news_view")
class YouthNewsView {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "news_id", nullable = false)
	private Long newsId;

	@Column(name = "viewer_id", nullable = false, length = 36)
	private String viewerId;

	@Column(name = "viewed_on", nullable = false)
	private LocalDate viewedOn;

	protected YouthNewsView() {
	}

	YouthNewsView(Long newsId, String viewerId, LocalDate viewedOn) {
		this.newsId = newsId;
		this.viewerId = viewerId;
		this.viewedOn = viewedOn;
	}
}
