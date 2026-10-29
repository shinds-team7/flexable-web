package com.flexable.web.market;

import org.springframework.http.CacheControl;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;

/**
 * 공개 API. 원본 시세는 화면 차트용 일별 종가(수집 대상·최근 3년)만 내려 준다(decisions/2026-10-26-invest-insight-redesign ④).
 * 시가·고가·저가·거래량은 주지 않는다. 계산 결과는 /simulations/run.
 */
@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

	private final MarketService market;
	private final EventService events;
	private final MarketInsightService insight;
	private final EventNewsService news;

	public MarketController(MarketService market, EventService events, MarketInsightService insight, EventNewsService news) {
		this.market = market;
		this.events = events;
		this.insight = insight;
		this.news = news;
	}

	/** 시장별 시가총액 상위 종목(기본 100). board: KOSPI | KOSDAQ | ETF */
	@GetMapping("/instruments")
	MarketDtos.BoardListing instruments(@RequestParam(defaultValue = "KOSPI") Board board) {
		return market.board(board);
	}

	/** 사건 상세(03 §8-2). 무슨 일·왜 움직였나(설명)는 검수된 설명이 생기기 전까지 비어 있다. */
	@GetMapping("/events/{id}")
	EventDtos.EventDetail event(@PathVariable long id) {
		return events.detail(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "사건을 찾을 수 없어요"));
	}

	/**
	 * 사건 무렵 뉴스 기사(네이버 뉴스 검색 중계). 검색 결과는 저장·캐시하지 않으므로 no-store(decisions/2026-10-28-event-news).
	 * 검색이 안 되면 200 status=UNAVAILABLE.
	 */
	@GetMapping("/events/{id}/news")
	ResponseEntity<EventDtos.EventNews> eventNews(@PathVariable long id) {
		EventDtos.EventNews body = news.news(id).orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "사건을 찾을 수 없어요"));
		return ResponseEntity.ok().cacheControl(CacheControl.noStore()).body(body);
	}

	/** 종목 일별 종가(화면 차트용). period: 3M | 6M | 1Y | 3Y(기본 3M) */
	@GetMapping("/instruments/{id}/prices")
	InsightDtos.PriceSeries prices(@PathVariable String id, @RequestParam(defaultValue = "3M") String period) {
		return insight.prices(id, period(period));
	}

	/** 종목·기간의 사건 핀(종목 사건 + 시장 사건). 상세는 /events/{id}. */
	@GetMapping("/instruments/{id}/events")
	InsightDtos.PriceEvents instrumentEvents(@PathVariable String id, @RequestParam(defaultValue = "3M") String period) {
		return insight.events(id, period(period));
	}

	/** 상단 시장 띠. 수집 전이거나 성공한 값이 없는 칸은 빠진다. */
	@GetMapping("/indices")
	InsightDtos.IndexStrip indices() {
		return insight.indices();
	}

	/** 업종별 시가총액 상위 종목. board: KOSPI | KOSDAQ, limit: 업종마다 1~10(기본 5) */
	@GetMapping("/industries")
	InsightDtos.IndustryListing industries(@RequestParam Board board, @RequestParam(defaultValue = "5") int limit) {
		if (board == Board.ETF) {
			throw ApiException.invalid("board", "업종은 코스피·코스닥만 볼 수 있어요");
		}
		if (limit < 1 || limit > 10) {
			throw ApiException.invalid("limit", "업종마다 1~10개까지 볼 수 있어요");
		}
		return insight.industries(board, limit);
	}

	private static PricePeriod period(String code) {
		return PricePeriod.parse(code).orElseThrow(() -> ApiException.invalid("period", "기간은 3M·6M·1Y·3Y 중에서 골라 주세요"));
	}

	@GetMapping("/status")
	MarketDtos.StatusResponse status() {
		return market.status();
	}
}
