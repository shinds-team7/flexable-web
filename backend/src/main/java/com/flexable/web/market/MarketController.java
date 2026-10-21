package com.flexable.web.market;

import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;

/** 공개 API. 원본 시세는 내려 주지 않는다(재제공 금지). 계산 결과는 /simulations/run. */
@RestController
@RequestMapping("/api/v1/market")
public class MarketController {

	private final MarketService market;

	public MarketController(MarketService market) {
		this.market = market;
	}

	/** 시장별 시가총액 상위 종목(기본 100). board: KOSPI | KOSDAQ | ETF */
	@GetMapping("/instruments")
	MarketDtos.BoardListing instruments(@RequestParam(defaultValue = "KOSPI") Board board) {
		return market.board(board);
	}

	@GetMapping("/status")
	MarketDtos.StatusResponse status() {
		return market.status();
	}
}
