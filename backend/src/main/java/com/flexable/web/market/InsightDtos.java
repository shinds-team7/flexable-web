package com.flexable.web.market;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;

/** 투자 인사이트 조회 응답(web-api.yaml PriceSeries·PriceEvents·IndexStrip·IndustryListing). 금액 계산 결과는 없다. */
public final class InsightDtos {

	private InsightDtos() {
	}

	/** 과거 시세 고지(decisions/2026-10-26-invest-insight-redesign ④). 차트 아래에 늘 보인다. */
	public static final String PRICE_NOTICE_KEY = "PRICE_PAST";
	public static final String PRICE_NOTICE = "지난 시세를 그대로 보여 줘요. 앞으로의 주가를 뜻하지 않고 이 종목을 사거나 팔라는 뜻이 아니에요.";

	public record SourceRow(String name, String note) {
	}

	public record PricePoint(LocalDate date, long close) {
	}

	public record PriceSeries(String id, String name, String kind, String period, LocalDate startDate, LocalDate endDate, LocalDate dataAsOf,
			String basis, List<PricePoint> points, List<SourceRow> sources, String noticeKey, String notice, boolean isSample) {
	}

	/** 사건 핀 한 개. 상세는 /market/events/{id}. code는 종목 사건이면 그 종목, 시장 사건이면 null. */
	public record PriceEventItem(long id, String code, String scope, LocalDate startDate, LocalDate endDate, int windowDays, String direction,
			double returnRate, Double marketReturn, String headline, boolean hasExplanation, String sourceName, int sourceCount,
			String topSource, double score) {
	}

	public record PriceEvents(String id, String period, LocalDate startDate, LocalDate endDate, List<PriceEventItem> items, String noticeKey) {
	}

	/** value·prevValue·change는 칸의 scale(지수·환율 2, 금 0), changeRate는 소수 4자리 내림. date는 그 칸의 기준일. */
	public record IndexItem(IndexKey key, String name, String kind, String unit, BigDecimal value, BigDecimal prevValue, BigDecimal change,
			BigDecimal changeRate, LocalDate date, String sourceName) {
	}

	public record IndexStrip(List<IndexItem> items, List<SourceRow> sources, boolean isSample) {
	}

	/** rank는 시장 전체 시가총액 순위. */
	public record IndustryInstrument(String id, String name, int rank, Long marketCap) {
	}

	public record IndustryItem(String categoryCode, String categoryName, Long totalMarketCap, List<IndustryInstrument> instruments) {
	}

	public record IndustryListing(Board board, List<IndustryItem> items, String classificationVersion, LocalDate classificationAsOf,
			List<SourceRow> sources, String note, boolean isSample) {
	}

	/** ingest가 넘기는 지수 하루 값. value는 칸 단위 그대로(코스피 2604.31). */
	public record IndexValue(LocalDate date, BigDecimal value) {
	}
}
