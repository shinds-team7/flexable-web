package com.flexable.web.ingest;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 온통청년(youthcenter) 청년정책 API 설정. 인증키는 환경변수(YOUTHCENTER_API_KEY)로만 넣는다(저장소 공개).
 *
 * @param apiKey 인증키. 비어 있으면 수집하지 않는다
 * @param baseUrl 예: https://www.youthcenter.go.kr/go/ythip/getPlcy
 */
@ConfigurationProperties("app.ingest.youthcenter")
public record YouthCenterProperties(String apiKey, String baseUrl, Duration connectTimeout, Duration readTimeout) {

	public YouthCenterProperties {
		baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://www.youthcenter.go.kr/go/ythip/getPlcy" : baseUrl.replaceAll("/+$", "");
		connectTimeout = connectTimeout == null ? Duration.ofSeconds(5) : connectTimeout;
		readTimeout = readTimeout == null ? Duration.ofSeconds(30) : readTimeout;
	}

	boolean configured() {
		return apiKey != null && !apiKey.isBlank();
	}
}
