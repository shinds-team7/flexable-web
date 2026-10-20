package com.flexable.web.auth;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;

import jakarta.persistence.LockModeType;

public interface CredentialRepository extends JpaRepository<Credential, Long> {

	/**
	 * 행을 고치는 곳(로그아웃·탈퇴)은 잠가서 읽는다. 잠금 없이 읽은 값으로 저장하면 다른 요청이 올린 token_version을
	 * 되돌릴 수 있다.
	 */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	Optional<Credential> findWithLockByMemberId(long memberId);
}
