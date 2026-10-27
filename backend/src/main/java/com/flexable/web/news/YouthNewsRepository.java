package com.flexable.web.news;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface YouthNewsRepository extends JpaRepository<YouthNews, Long> {

	Optional<YouthNews> findBySourceAndExternalId(String source, String externalId);

	List<YouthNews> findByReviewStatusNotOrderByIdAsc(YouthNews.ReviewStatus status);
}
