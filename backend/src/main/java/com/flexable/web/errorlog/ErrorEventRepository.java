package com.flexable.web.errorlog;

import java.time.LocalDate;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

public interface ErrorEventRepository extends JpaRepository<ErrorEvent, Long> {

	Optional<ErrorEvent> findByDayAndFingerprint(LocalDate day, String fingerprint);

	long countByDay(LocalDate day);

	@Modifying
	@Query("delete from ErrorEvent e where e.day < :day")
	int deleteBefore(LocalDate day);

	@Modifying
	@Query("delete from ErrorEvent e where e.userId = :userId")
	int deleteByUserId(long userId);
}
