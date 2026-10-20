package com.flexable.web.applink;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

public interface AppLinkRepository extends JpaRepository<AppLink, Long> {

	Optional<AppLink> findByUserId(long userId);

	boolean existsByUserId(long userId);

	/** 앱 서버를 부르는 동안 해제·다시 연동됐을 수 있으므로 읽었던 행(id)만 지운다. */
	@Modifying
	@Query("delete from AppLink a where a.id = :id")
	int deleteRow(@Param("id") long id);
}
