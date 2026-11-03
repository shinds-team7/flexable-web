package com.flexable.web.goalscenario;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Modifying;
import org.springframework.data.jpa.repository.Query;
import org.springframework.data.repository.query.Param;

interface SavedScenarioRepository extends JpaRepository<SavedScenario, Long> {

	long countByUserId(long userId);

	List<SavedScenario> findByUserIdOrderBySavedAtDescIdDesc(long userId);

	Optional<SavedScenario> findByIdAndUserId(long id, long userId);

	@Modifying
	@Query("delete from SavedScenario s where s.userId = :userId")
	void deleteByUserId(@Param("userId") long userId);
}
