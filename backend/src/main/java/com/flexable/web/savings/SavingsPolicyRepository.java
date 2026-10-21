package com.flexable.web.savings;

import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

interface SavingsPolicyRepository extends JpaRepository<SavingsPolicy, Long> {

	Optional<SavingsPolicy> findByPlcyNo(String plcyNo);
}
