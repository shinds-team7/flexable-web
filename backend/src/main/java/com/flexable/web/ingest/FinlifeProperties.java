package com.flexable.web.ingest;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 금융감독원 금융상품한눈에(finlife) 호출 설정. 인증키는 환경변수(FINLIFE_API_KEY)로만 넣는다(저장소 공개).
 *
 * @param apiKey 인증키(32자리). 비어 있으면 수집하지 않는다
 * @param baseUrl 예: https://finlife.fss.or.kr/finlifeapi
 */
@ConfigurationProperties("app.ingest.finlife")
public record FinlifeProperties(String apiKey, String baseUrl, Duration connectTimeout, Duration readTimeout) {

	public FinlifeProperties {
		baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://finlife.fss.or.kr/finlifeapi" : baseUrl.replaceAll("/+$", "");
		connectTimeout = connectTimeout == null ? Duration.ofSeconds(5) : connectTimeout;
		readTimeout = readTimeout == null ? Duration.ofSeconds(20) : readTimeout;
	}

	boolean configured() {
		return apiKey != null && !apiKey.isBlank();
	}
}
