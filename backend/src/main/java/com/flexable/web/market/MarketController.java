package com.flexable.web.market;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;

/** 공개 API. 원본 시세는 내려 주지 않는다(재제공 금지). 계산 결과는 /simulations/run. */
@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

	private final MarketService market;
	private final EventService events;

	public MarketController(MarketService market, EventService events) {
		this.market = market;
		this.events = events;
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

	@GetMapping("/status")
	MarketDtos.StatusResponse status() {
		return market.status();
	}
}
