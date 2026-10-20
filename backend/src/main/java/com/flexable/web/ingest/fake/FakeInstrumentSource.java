package com.flexable.web.ingest.fake;

import java.util.List;
import java.util.Map;

import com.flexable.web.market.Board;
import com.flexable.web.ingest.InstrumentInfo;
import com.flexable.web.ingest.InstrumentListing;
import com.flexable.web.ingest.InstrumentSource;

/** 키 없이 쓰는 고정 종목 목록(테스트·오프라인 확인용). 시가총액은 순서만 맞춘 가짜 값이다. */
public class FakeInstrumentSource implements InstrumentSource {

	private static final Map<Board, List<InstrumentInfo>> ITEMS = Map.of(
			Board.KOSPI, List.of(
					new InstrumentInfo("005930", "삼성전자", "KOSPI", "STOCK", 900L),
					new InstrumentInfo("000660", "SK하이닉스", "KOSPI", "STOCK", 800L),
					new InstrumentInfo("035420", "NAVER", "KOSPI", "STOCK", 300L),
					new InstrumentInfo("105560", "KB금융", "KOSPI", "STOCK", 400L)),
			Board.KOSDAQ, List.of(
					new InstrumentInfo("196170", "알테오젠", "KOSDAQ", "STOCK", 200L),
					new InstrumentInfo("086520", "에코프로", "KOSDAQ", "STOCK", 150L)),
			Board.ETF, List.of(
					new InstrumentInfo("069500", "KODEX 200", null, "ETF", 120L),
					new InstrumentInfo("102110", "TIGER 200", null, "ETF", 100L),
					new InstrumentInfo("360750", "TIGER 미국S&P500", null, "ETF", 110L)));

	@Override
	public String source() {
		return "테스트용 가짜 종목 목록";
	}

	@Override
	public InstrumentListing listing(Board board) {
		return new InstrumentListing(ITEMS.get(board), source(), null);
	}
}
