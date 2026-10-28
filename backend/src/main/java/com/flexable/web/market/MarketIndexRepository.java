package com.flexable.web.market;

import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MarketIndexRepository extends JpaRepository<MarketIndexDaily, MarketIndexDaily.Key> {

	/** 마지막 값과 그 앞 값(전일 대비 계산용). */
	List<MarketIndexDaily> findTop2ByIndexKeyOrderByTradeDateDesc(IndexKey indexKey);

	List<MarketIndexDaily> findByIndexKeyAndTradeDateBetween(IndexKey indexKey, LocalDate from, LocalDate to);

	@Query("select max(m.tradeDate) from MarketIndexDaily m where m.indexKey = :indexKey")
	Optional<LocalDate> findLatestTradeDate(IndexKey indexKey);
}
