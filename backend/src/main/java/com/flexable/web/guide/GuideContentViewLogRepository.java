package com.flexable.web.guide;

import java.time.LocalDate;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface GuideContentViewLogRepository extends JpaRepository<GuideContentViewLog, Long> {

	boolean existsByContentIdAndViewerIdAndViewedOn(String contentId, String viewerId, LocalDate viewedOn);

	@Modifying
	@Query("delete from GuideContentViewLog v where v.viewedOn < :before")
	int deleteOlderThan(@Param("before") LocalDate before);
}
