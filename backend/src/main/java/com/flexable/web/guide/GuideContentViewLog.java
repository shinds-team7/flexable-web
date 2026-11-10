package com.flexable.web.guide;

import java.time.LocalDate;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 글 열람 한 줄: (글, 방문자, 날짜)당 하나. 방문자 값은 브라우저가 만든 임의 UUID라 계정과 이어지지 않는다. */
@Entity
@Table(name = "guide_content_view_log")
class GuideContentViewLog {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "content_id", nullable = false, length = 64)
	private String contentId;

	@Column(name = "viewer_id", nullable = false, length = 36)
	private String viewerId;

	@Column(name = "viewed_on", nullable = false)
	private LocalDate viewedOn;

	protected GuideContentViewLog() {
	}

	GuideContentViewLog(String contentId, String viewerId, LocalDate viewedOn) {
		this.contentId = contentId;
		this.viewerId = viewerId;
		this.viewedOn = viewedOn;
	}
}
