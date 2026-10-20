package com.flexable.web.auth;

public interface OAuthProviderClient {

	Profile fetch(String provider, String code);

	void unlinkKakao(String providerUserId);

	record Profile(String providerUserId, String email, boolean emailVerified) {
	}
}
