package com.flexable.web.guide;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.HttpStatus;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

/** 공개 API: 금융 가이드 글별 조회수. 계정과 연결하지 않는다. */
@RestController
@RequestMapping("/api/v1/guide-contents")
public class GuideContentController {

	private final GuideContentViewService views;

	public GuideContentController(GuideContentViewService views) {
		this.views = views;
	}

	/** 글별 누적 조회수. 1분 캐시 */
	@GetMapping("/views")
	ResponseEntity<GuideContentDtos.ViewCounts> counts() {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic())
			.body(views.all());
	}

	/** 글을 열었다고 센다(방문자·글·날짜당 한 번) */
	@PostMapping("/{id}/views")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void view(@PathVariable String id, @RequestBody GuideContentDtos.ViewRequest body) {
		views.record(id, body.viewerId());
	}
}
