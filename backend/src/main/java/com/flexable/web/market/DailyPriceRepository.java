package com.flexable.web.market;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface DailyPriceRepository extends JpaRepository<DailyPrice, DailyPrice.Key> {

	List<DailyPrice> findByInstrumentIdAndTradeDateGreaterThanEqualOrderByTradeDateAsc(long instrumentId, LocalDate from);

	List<DailyPrice> findByInstrumentIdOrderByTradeDateAsc(long instrumentId);

	/** 근거 조회 시작일: before 앞 거래일 5개, 최근부터. */
	List<DailyPrice> findTop5ByInstrumentIdAndTradeDateLessThanOrderByTradeDateDesc(long instrumentId, LocalDate before);

	/** after(포함) 이후 첫 거래일. */
	Optional<DailyPrice> findFirstByInstrumentIdAndTradeDateGreaterThanEqualOrderByTradeDateAsc(long instrumentId, LocalDate after);

	List<DailyPrice> findByInstrumentIdAndTradeDateBetween(long instrumentId, LocalDate from, LocalDate to);

	@Query("select max(p.tradeDate) from DailyPrice p where p.instrumentId = :instrumentId")
	Optional<LocalDate> findLatestTradeDate(long instrumentId);

	@Query("select min(p.tradeDate) from DailyPrice p where p.instrumentId = :instrumentId")
	Optional<LocalDate> findEarliestTradeDate(long instrumentId);

	@Query("select max(p.tradeDate) from DailyPrice p")
	Optional<LocalDate> findLatestTradeDate();
}
