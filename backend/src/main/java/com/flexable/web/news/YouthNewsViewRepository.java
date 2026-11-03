package com.flexable.web.news;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface YouthNewsViewRepository extends JpaRepository<YouthNewsView, Long> {

	boolean existsByNewsIdAndViewerIdAndViewedOn(Long newsId, String viewerId, LocalDate viewedOn);

	long countByViewerIdAndViewedOn(String viewerId, LocalDate viewedOn);

	/** since 이후(포함) 소식별 서로 다른 방문자 수, 많은 순. [소식 id, 방문자 수] */
	@Query("select v.newsId, count(v) from YouthNewsView v where v.viewedOn >= :since group by v.newsId order by count(v) desc, v.newsId asc")
	List<Object[]> visitorsSince(@Param("since") LocalDate since);

	@Modifying
	@Query("delete from YouthNewsView v where v.viewedOn < :before")
	int deleteOlderThan(@Param("before") LocalDate before);
}
