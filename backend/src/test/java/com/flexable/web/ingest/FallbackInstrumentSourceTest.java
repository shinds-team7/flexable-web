package com.flexable.web.ingest;

import com.flexable.web.market.Board;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;

import java.util.List;

import org.junit.jupiter.api.Test;

import com.flexable.web.ingest.kiwoom.KiwoomInstrumentSourceAccess;

class FallbackInstrumentSourceTest {

	private static InstrumentSource fixed(String source, Board failOn) {
		return new InstrumentSource() {
			@Override
			public String source() {
				return source;
			}

			@Override
			public InstrumentListing listing(Board board) {
				if (board == failOn) {
					throw new IllegalStateException("401 Unauthorized");
				}
				return new InstrumentListing(List.of(new InstrumentInfo(source + board, "x", null, "STOCK", 1L)), source, null);
			}
		};
	}

	@Test
	void 기본이_되는_시장은_그대로_실패한_시장만_대체_소스() {
		FallbackInstrumentSource p = new FallbackInstrumentSource(fixed("KRX", Board.ETF), fixed("키움", null));
		InstrumentListing kospi = p.listing(Board.KOSPI);
		assertEquals("KRX", kospi.source());
		assertNull(kospi.note());
		InstrumentListing etf = p.listing(Board.ETF);
		assertEquals("키움", etf.source());
		assertEquals("키움ETF", etf.items().getFirst().code());
		assertNotNull(etf.note());
	}

	@Test
	void 키움_시가총액은_상장주식수_곱하기_종가() {
		assertEquals(6350000L * 8390, KiwoomInstrumentSourceAccess.cap("0000000006350000", "00008390"));
		assertNull(KiwoomInstrumentSourceAccess.cap("", "100"));
	}
}
