package com.flexable.web.guide;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;
import org.springframework.transaction.annotation.Transactional;

interface GuideContentViewCountRepository extends JpaRepository<GuideContentViewCount, String> {

	/** 동시에 들어와도 빠지지 않게 DB에서 한 번에 더한다 */
	@Transactional
	@Modifying
	@Query("update GuideContentViewCount c set c.viewCount = c.viewCount + 1 where c.contentId = :id")
	int increment(@Param("id") String id);
}
