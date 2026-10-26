package com.flexable.web.news;

import java.time.Duration;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 공개 API. 필터는 쿼리로만 받고 저장하지 않는다(01 §F4: 서버 저장·개인정보 수집 없음). */
@RestController
@RequestMapping("/api/v1/youth-news")
public class NewsController {

	private final NewsService news;

	public NewsController(NewsService news) {
		this.news = news;
	}

	/** 승인된 소식. age: 만 나이, region: 시도 이름(서울·경기…), category: TRANSPORT | HOUSING | FINANCE | JOB | EDUCATION | CULTURE | TAX | ETC */
	@GetMapping
	ResponseEntity<NewsDtos.NewsFeed> list(@RequestParam(required = false) Integer age, @RequestParam(required = false) String region,
			@RequestParam(required = false) NewsCategory category) {
		return ResponseEntity.ok()
			.cacheControl(CacheControl.maxAge(Duration.ofMinutes(5)).cachePublic())
			.body(news.list(age, region, category));
	}
}
