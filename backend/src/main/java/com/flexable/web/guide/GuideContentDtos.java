package com.flexable.web.guide;

import java.util.List;

public final class GuideContentDtos {

	private GuideContentDtos() {
	}

	/** POST /guide-contents/{id}/views 요청. viewerId는 브라우저가 만든 임의 UUID */
	public record ViewRequest(String viewerId) {
	}

	/** 글 하나의 누적 조회수 */
	public record ViewCount(String id, long views) {
	}

	/** GET /guide-contents/views 응답 */
	public record ViewCounts(List<ViewCount> items) {
	}
}
