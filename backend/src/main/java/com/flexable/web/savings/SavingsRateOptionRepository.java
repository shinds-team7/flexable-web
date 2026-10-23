package com.flexable.web.savings;

import java.util.Collection;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface SavingsRateOptionRepository extends JpaRepository<SavingsRateOption, Long> {

	List<SavingsRateOption> findByRsrvTypeAndSaveTrm(String rsrvType, int saveTrm);

	List<SavingsRateOption> findByProductId(Long productId);

	@Modifying
	@Query("delete from SavingsRateOption o where o.productId = :productId")
	void deleteByProductId(@Param("productId") Long productId);

	@Modifying
	@Query("delete from SavingsRateOption o where o.productId in :ids")
	void deleteByProductIdIn(@Param("ids") Collection<Long> ids);
}
