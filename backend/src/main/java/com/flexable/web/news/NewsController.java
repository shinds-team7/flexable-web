package com.flexable.web.news;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.http.HttpStatus;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 공개 API. 필터는 쿼리로만 받고 저장하지 않는다(01 §F4: 서버 저장·개인정보 수집 없음). */
@RestController
@RequestMapping("/api/v1/youth-news")
public class NewsController {

	private final NewsService news;
	private final NewsViewService views;

	public NewsController(NewsService news, NewsViewService views) {
		this.news = news;
		this.views = views;
	}

	/** 승인된 소식. age: 만 나이, region: 시도 이름(서울·경기…), category: TRANSPORT | HOUSING | FINANCE | JOB | EDUCATION | CULTURE | TAX | ETC */
	@GetMapping
	ResponseEntity<NewsDtos.NewsFeed> list(@RequestParam(required = false) Integer age, @RequestParam(required = false) String region,
			@RequestParam(required = false) NewsCategory category) {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
			.body(news.list(age, region, category));
	}

	/** 요즘 많이 본 지원금: 최근 7일 서로 다른 방문자 수 순. 1분 캐시 */
	@GetMapping("/hot")
	ResponseEntity<NewsDtos.HotNews> hot() {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.maxAge(Duration.ofMinutes(1)).cachePublic())
			.body(views.hot());
	}

	/** 소식을 열었다고 센다(방문자·소식·날짜당 한 번). 계정과 연결하지 않는다. */
	@PostMapping("/{id}/views")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void view(@PathVariable long id, @RequestBody NewsDtos.ViewRequest body) {
		views.record(id, body.viewerId());
	}
}
