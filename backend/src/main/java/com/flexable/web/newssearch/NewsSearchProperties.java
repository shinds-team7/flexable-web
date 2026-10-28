package com.flexable.web.newssearch;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 사건 무렵 뉴스 검색(decisions/2026-10-28-event-news). 키는 환경 변수(NAVER_API_HUB_KEY_ID·NAVER_API_HUB_KEY)로만 넣는다.
 * - source: naver | fake. naver는 키가 비어 있으면 꺼진다(화면은 UNAVAILABLE)
 * 하루 호출 상한(app.news-search.daily-cap = NAVER_NEWS_DAILY_CAP)은 market.EventNewsService가 읽고 센다.
 */
@ConfigurationProperties("app.news-search")
public record NewsSearchProperties(String source, String baseUrl, String keyId, String key) {

	public NewsSearchProperties {
		source = source == null || source.isBlank() ? "naver" : source;
		baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://naverapihub.apigw.ntruss.com" : baseUrl;
	}

	public boolean configured() {
		return keyId != null && !keyId.isBlank() && key != null && !key.isBlank();
	}

	@Override
	public String toString() {
		return "NewsSearchProperties[source=" + source + ", configured=" + configured() + "]";
	}
}
