package com.flexable.web.market;

import java.time.LocalDate;
import java.util.List;

/** market의 공개 DTO. 다른 패키지(simulation·ingest)는 엔티티 대신 이것만 쓴다. */
public final class MarketDtos {

	private MarketDtos() {
	}

	/** ingest가 넘기는 종목 한 줄. kind: STOCK | ETF, marketCap: 원(모르면 null) */
	public record InstrumentRow(String code, String name, String market, String kind, Long marketCap) {
	}

	/** 화면에 내려 주는 종목. id는 종목 코드, rank는 그 시장 시가총액 순위(1부터). */
	public record InstrumentView(String id, String name, String market, String kind, Board board, int rank, Long marketCap) {
	}

	/** note: 기본 소스 대신 대체 소스를 쓴 이유 등. 아직 수집 전이면 items가 비고 dataAsOf가 null */
	public record BoardListing(Board board, List<InstrumentView> items, String source, String note, LocalDate dataAsOf) {
	}

	/** pricesAsOf: 저장된 가장 늦은 거래일, instrumentsAsOf: 종목 목록 기준일. empty면 worker가 아직 수집하지 않았다. */
	public record StatusResponse(LocalDate pricesAsOf, LocalDate instrumentsAsOf, int instruments, boolean empty) {
	}
}
