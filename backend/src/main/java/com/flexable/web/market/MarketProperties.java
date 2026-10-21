package com.flexable.web.market;

import org.springframework.boot.context.properties.ConfigurationProperties;

/** topLimit: 시장(코스피·코스닥·ETF)마다 시가총액 상위 몇 종목을 목록에 보여 주고 계산·수집 대상으로 둘지. */
@ConfigurationProperties("app.market")
public record MarketProperties(Integer topLimit) {

	public MarketProperties {
		topLimit = topLimit == null ? 100 : topLimit;
	}
}
