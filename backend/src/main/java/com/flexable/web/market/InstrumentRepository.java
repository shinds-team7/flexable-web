package com.flexable.web.market;

import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;

public interface InstrumentRepository extends JpaRepository<Instrument, Long> {

	Optional<Instrument> findByCode(String code);

	List<Instrument> findByBoardAndCapRankNotNullOrderByCapRankAsc(Board board);

	List<Instrument> findByCapRankNotNull();

	List<Instrument> findByCodeIn(List<String> codes);
}
