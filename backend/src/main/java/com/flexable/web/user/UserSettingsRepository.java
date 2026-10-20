package com.flexable.web.user;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

public interface UserSettingsRepository extends JpaRepository<UserSettings, Long> {

	/** 설정을 고칠 때는 잠가서 읽는다. 본 안내 병합이 동시에 오면 한쪽이 지워질 수 있다. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<UserSettings> findWithLockByUserId(long userId);
}
