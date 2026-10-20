package com.flexable.web.auth;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Lock;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;

import jakarta.persistence.LockModeType;

public interface IdentityRepository extends JpaRepository<Identity, Long> {

	Optional<Identity> findByProviderAndProviderUserId(String provider, String providerUserId);

	Optional<Identity> findFirstByUserIdOrderByIdAsc(long userId);

	List<Identity> findByUserId(long userId);

	/** 잠금 읽기라 같은 트랜잭션의 이전 스냅숏이 아니라 방금 커밋된 행까지 본다. */
	@Lock(LockModeType.PESSIMISTIC_WRITE)
	List<Identity> findWithLockByUserId(long userId);

	@Modifying
	@Query("delete from Identity i where i.userId = :userId")
	void deleteByUserId(long userId);
}
