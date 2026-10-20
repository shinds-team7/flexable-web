package com.flexable.web.applink;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 앱 연동 설정. 비밀 값(service-key·encryption-key)은 환경변수로만 넣는다(저장소 공개).
 *
 * @param mode http(앱 서버 호출) 또는 snapshot(고정 데이터, 시연·로컬)
 * @param baseUrl 앱 서버 주소(경로 /internal/v1 앞까지). 비어 있으면 연동을 쓸 수 없다
 * @param serviceKey 앱 서버 WEB_LINK_SERVICE_KEYS 중 하나와 같은 값(X-Service-Key)
 * @param encryptionKey linkId 암호화 키(Base64, 32바이트). http 모드에서 baseUrl이 있으면 필수
 * @param refreshInterval 이 시간 안에 다시 조회하면 앱 서버를 부르지 않고 저장한 값을 준다
 */
@ConfigurationProperties("app.applink")
public record AppLinkProperties(String mode, String baseUrl, String serviceKey, String encryptionKey,
		Duration connectTimeout, Duration readTimeout, Duration refreshInterval) {

	public boolean snapshot() {
		return "snapshot".equals(mode);
	}

	public boolean configured() {
		return baseUrl != null && !baseUrl.isBlank() && serviceKey != null && !serviceKey.isBlank();
	}
}
