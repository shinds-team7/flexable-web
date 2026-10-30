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

	@Query("select max(m.tradeDate) from MarketIndexDaily m where m.indexKey = :indexKey and m.source = :source")
	Optional<LocalDate> findLatestTradeDate(IndexKey indexKey, String source);

	/** 칸의 제공처가 바뀌면 이전 제공처 값을 지운다(전일 대비가 두 제공처를 섞지 않게). */
	long deleteByIndexKeyAndSourceNot(IndexKey indexKey, String source);

	/** 소스가 없어 건너뛴 칸의 가짜 값을 지운다. */
	long deleteByIndexKeyAndSourceStartingWith(IndexKey indexKey, String prefix);
}
