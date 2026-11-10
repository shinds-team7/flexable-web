package com.flexable.web.guide;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 글 하나의 누적 조회수. 줄이 있는 글만 집계한다(V36). */
@Entity
@Table(name = "guide_content_views")
class GuideContentViewCount {

	@Id
	@Column(name = "content_id", length = 64)
	private String contentId;

	@Column(name = "view_count", nullable = false)
	private long viewCount;

	protected GuideContentViewCount() {
	}

	String getContentId() {
		return contentId;
	}

	long getViewCount() {
		return viewCount;
	}
}
