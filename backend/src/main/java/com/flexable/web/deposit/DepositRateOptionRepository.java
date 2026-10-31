package com.flexable.web.deposit;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface DepositRateOptionRepository extends JpaRepository<DepositRateOption, Long> {

	List<DepositRateOption> findBySaveTrm(int saveTrm);

	List<DepositRateOption> findByProductId(Long productId);

	@Modifying
	@Query("delete from DepositRateOption o where o.productId = :productId")
	void deleteByProductId(@Param("productId") Long productId);

	@Modifying
	@Query("delete from DepositRateOption o where o.productId in :ids")
	void deleteByProductIdIn(@Param("ids") Collection<Long> ids);
}
