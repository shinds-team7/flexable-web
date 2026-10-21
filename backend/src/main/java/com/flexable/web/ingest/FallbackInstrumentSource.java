package com.flexable.web.ingest;

import com.flexable.web.market.Board;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

/** 기본 소스가 실패하거나 비면 대체 소스로 받는다(예: KRX ETF API 미승인 → 키움 종목정보). */
public class FallbackInstrumentSource implements InstrumentSource {

	private static final Logger log = LoggerFactory.getLogger(FallbackInstrumentSource.class);

	private final InstrumentSource primary;
	private final InstrumentSource fallback;

	public FallbackInstrumentSource(InstrumentSource primary, InstrumentSource fallback) {
		this.primary = primary;
		this.fallback = fallback;
	}

	@Override
	public String source() {
		return primary.source();
	}

	@Override
	public InstrumentListing listing(Board board) {
		String reason;
		try {
			InstrumentListing l = primary.listing(board);
			if (!l.items().isEmpty()) {
				return l;
			}
			reason = "결과 없음";
		}
		catch (RuntimeException e) {
			reason = e.getMessage();
		}
		log.warn("{} {} 목록 실패({}) → {}로 대신 받음", primary.source(), board, reason, fallback.source());
		InstrumentListing l = fallback.listing(board);
		return new InstrumentListing(l.items(), l.source(), primary.source() + "에서 받지 못해 " + l.source() + " 자료로 보여 줘요");
	}
}
