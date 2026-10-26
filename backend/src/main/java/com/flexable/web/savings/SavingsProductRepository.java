package com.flexable.web.savings;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface SavingsProductRepository extends JpaRepository<SavingsProduct, Long> {

	Optional<SavingsProduct> findByFinCoNoAndFinPrdtCd(String finCoNo, String finPrdtCd);
}
