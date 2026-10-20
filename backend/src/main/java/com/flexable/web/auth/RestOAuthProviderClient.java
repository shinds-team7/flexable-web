package com.flexable.web.auth;

import java.util.Map;
import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.stereotype.Component;
import org.springframework.util.LinkedMultiValueMap;
import org.springframework.util.MultiValueMap;
import org.springframework.web.client.RestClient;


@Component
public class RestOAuthProviderClient implements OAuthProviderClient {
	private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
	private final RestClient http;
	private final OAuthProperties props;

	public RestOAuthProviderClient(RestClient oauthRestClient, OAuthProperties props) {
		this.http = oauthRestClient;
		this.props = props;
	}
	@Override
	public Profile fetch(String provider, String code) {
		boolean kakao = "kakao".equals(provider);
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("grant_type", "authorization_code");
		form.add("client_id", props.clientId(provider));
		form.add("redirect_uri", props.callback(provider));
		form.add("code", code);
		String secret = kakao ? props.kakao().clientSecret() : props.google().clientSecret();
		if (secret != null && !secret.isBlank()) {
			form.add("client_secret", secret);
		}
		Map<String, Object> token = http.post()
			.uri(kakao ? "https://kauth.kakao.com/oauth/token" : "https://oauth2.googleapis.com/token")
			.contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().body(MAP);
		String accessToken = required(token, "access_token");
		Map<String, Object> profile = http.get()
			.uri(kakao ? "https://kapi.kakao.com/v2/user/me" : "https://openidconnect.googleapis.com/v1/userinfo")
			.headers(h -> h.setBearerAuth(accessToken)).retrieve().body(MAP);
		String id = required(profile, kakao ? "id" : "sub");
		if (id.length() > 100) {
			throw new IllegalStateException("회원 식별값 형식 오류");
		}
		Map<?, ?> account = kakao ? (profile.get("kakao_account") instanceof Map<?, ?> m ? m : Map.of()) : profile;
		String email = account.get("email") instanceof String s ? s : null;
		boolean verified = kakao
				? Boolean.TRUE.equals(account.get("is_email_valid")) && Boolean.TRUE.equals(account.get("is_email_verified"))
				: Boolean.TRUE.equals(account.get("email_verified"));
		return new Profile(id, email, verified);
	}
	@Override
	public void unlinkKakao(String providerUserId) {
		MultiValueMap<String, String> form = new LinkedMultiValueMap<>();
		form.add("target_id_type", "user_id");
		form.add("target_id", providerUserId);
		http.post().uri("https://kapi.kakao.com/v1/user/unlink")
			.header("Authorization", "KakaoAK " + props.kakao().adminKey())
			.contentType(MediaType.APPLICATION_FORM_URLENCODED).body(form).retrieve().toBodilessEntity();
	}
	private static String required(Map<String, Object> values, String key) {
		Object value = values == null ? null : values.get(key);
		if (value == null || value.toString().isBlank()) {
			throw new IllegalStateException("소셜 로그인 응답 형식 오류");
		}
		return value.toString();
	}
}
