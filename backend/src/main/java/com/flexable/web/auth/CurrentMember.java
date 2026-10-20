package com.flexable.web.auth;

import org.springframework.security.oauth2.jwt.Jwt;

public final class CurrentMember {

	private CurrentMember() {
	}

	public static long id(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}

	/** 인증 필터가 검사를 마친 토큰의 버전. 검사 뒤에 폐기됐는지 다시 볼 때 쓴다. */
	public static int tokenVersion(Jwt jwt) {
		return ((Number) jwt.getClaims().get(TokenService.TOKEN_VERSION_CLAIM)).intValue();
	}
}
