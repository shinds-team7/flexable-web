package com.flexable.web.market;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * topLimit: 시장(코스피·코스닥·ETF)마다 시가총액 상위 몇 종목을 목록에 보여 주고 계산·수집 대상으로 둘지.
 * indexProxy: 사건 탐지에서 시장 전체로 보는 종목 코드(코스피200 추종 ETF). 종목 사건은 이 종목의 수익률을 빼고, 시장 사건은 이 종목에 붙인다.
 */
@ConfigurationProperties("app.market")
public record MarketProperties(Integer topLimit, String indexProxy) {

	public MarketProperties {
		topLimit = topLimit == null ? 100 : topLimit;
		indexProxy = indexProxy == null || indexProxy.isBlank() ? "069500" : indexProxy;
	}
}
