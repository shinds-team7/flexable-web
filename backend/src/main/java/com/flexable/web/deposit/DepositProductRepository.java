package com.flexable.web.deposit;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface DepositProductRepository extends JpaRepository<DepositProduct, Long> {

	Optional<DepositProduct> findByFinCoNoAndFinPrdtCd(String finCoNo, String finPrdtCd);
}
