package com.flexable.web.auth;

import org.springframework.boot.context.properties.ConfigurationProperties;

@ConfigurationProperties("app.auth")
public record AuthProperties(Jwt jwt) {

	/** secret은 환경변수 WEB_JWT_SECRET으로만 넣는다. 앱(project2)의 키와 다른 값이어야 한다. */
	public record Jwt(String secret, int ttlDays) {
	}
}
