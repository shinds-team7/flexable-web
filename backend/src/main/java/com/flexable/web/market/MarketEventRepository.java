package com.flexable.web.market;

import java.time.LocalDate;
import java.util.List;

import org.springframework.data.jpa.repository.JpaRepository;
import org.springframework.data.jpa.repository.Query;

public interface MarketEventRepository extends JpaRepository<MarketEvent, Long> {

	List<MarketEvent> findByInstrumentIdAndScopeAndDetectorVersion(long instrumentId, String scope, String detectorVersion);

	List<MarketEvent> findByInstrumentIdAndDetectorVersionOrderByStartDateAsc(long instrumentId, String detectorVersion);

	/** 기간(from~to) 안에 시작한 사건, 시작일 순. */
	List<MarketEvent> findByInstrumentIdInAndDetectorVersionAndStartDateBetweenOrderByStartDateAsc(List<Long> instrumentIds,
			String detectorVersion, LocalDate from, LocalDate to);

	/** 근거를 찾을 종목 사건(corp_code가 있는 종목), 최근 사건부터. 확인 시각 조건은 서비스가 거른다. */
	@Query("select e, i.corpCode from MarketEvent e, Instrument i where e.instrumentId = i.id and e.scope = 'STOCK'"
			+ " and e.detectorVersion = :version and i.corpCode is not null order by e.endDate desc, e.id desc")
	List<Object[]> findStockEventsWithCorpCode(String version);
}
