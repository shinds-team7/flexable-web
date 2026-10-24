package com.flexable.web.engagement;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

public interface GoalRepository extends JpaRepository<Goal, Long> {
	Optional<Goal> findByUserId(long userId);

	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Goal> findWithLockByUserId(long userId);
}
