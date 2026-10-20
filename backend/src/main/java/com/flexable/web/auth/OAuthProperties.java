package com.flexable.web.auth;

import java.util.List;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 소셜 로그인 설정. client-id가 비어 있는 공급자는 꺼진 것으로 본다. 비밀 값(client-secret·admin-key)은 환경변수로만 넣는다.
 * callback-base-url은 공급자 콘솔에 등록한 웹 백엔드 주소다(콜백 경로 /api/v1/auth/oauth/{provider}/callback).
 */
@ConfigurationProperties("app.auth.oauth")
public record OAuthProperties(String callbackBaseUrl, List<String> allowedRedirectUris, Kakao kakao, Google google) {

	public record Kakao(String clientId, String clientSecret, String adminKey, String scope) {
	}

	public record Google(String clientId, String clientSecret) {
	}

	public String clientId(String provider) {
		return "kakao".equals(provider) ? kakao.clientId() : google.clientId();
	}

	public String callback(String provider) {
		return callbackBaseUrl + "/api/v1/auth/oauth/" + provider + "/callback";
	}
}
