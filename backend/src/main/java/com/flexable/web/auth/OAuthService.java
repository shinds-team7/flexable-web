package com.flexable.web.auth;

import java.nio.charset.StandardCharsets;
import java.net.URLEncoder;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.Base64;
import java.util.List;
import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.PessimisticLockingFailureException;
import org.springframework.stereotype.Service;
import org.springframework.web.client.RestClientResponseException;
import org.springframework.web.util.UriComponentsBuilder;
import com.flexable.web.auth.AuthDtos.AuthResponse;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;

@Service
public class OAuthService {
	private static final Logger log = LoggerFactory.getLogger(OAuthService.class);
	private static final List<String> PROVIDERS = List.of("kakao", "google");
	private final OAuthProperties props;
	private final OAuthStore store;
	private final OAuthProviderClient client;
	private final OAuthUserService users;
	private final AuthService auth;

	public OAuthService(OAuthProperties props, OAuthStore store, OAuthProviderClient client, OAuthUserService users, AuthService auth) {
		this.props = props;
		this.store = store;
		this.client = client;
		this.users = users;
		this.auth = auth;
	}
	public List<String> providers() {
		return PROVIDERS.stream().filter(this::available).toList();
	}
	public String start(String provider, String redirectUri, String challenge) {
		checkProvider(provider);
		if (redirectUri == null || !props.allowedRedirectUris().contains(redirectUri)) {
			throw ApiException.invalid("redirectUri", "허용되지 않은 로그인 주소예요");
		}
		if (challenge == null || !challenge.matches("^[A-Za-z0-9_-]{43}$")) {
			return redirect(redirectUri, "error", "failed");
		}
		if (!available(provider)) {
			return redirect(redirectUri, "error", "provider_unavailable");
		}
		String state = store.saveState(provider, redirectUri, challenge);
		if (state == null) {
			return redirect(redirectUri, "error", "failed");
		}
		boolean kakao = "kakao".equals(provider);
		UriComponentsBuilder url = UriComponentsBuilder.fromUriString(kakao
				? "https://kauth.kakao.com/oauth/authorize" : "https://accounts.google.com/o/oauth2/v2/auth")
			.queryParam("client_id", props.clientId(provider)).queryParam("redirect_uri", props.callback(provider))
			.queryParam("response_type", "code").queryParam("state", state);
		if (!kakao) {
			url.queryParam("scope", "openid email").queryParam("prompt", "select_account");
		}
		else if (props.kakao().scope() != null && !props.kakao().scope().isBlank()) {
			url.queryParam("scope", props.kakao().scope());
		}
		return url.build().encode().toUriString();
	}
	/** 유효한 state가 없으면 리다이렉트 주소를 신뢰할 수 없다. */
	public String callback(String provider, String code, String stateValue, String error) {
		OAuthStore.State state = store.consumeState(stateValue);
		if (state == null || !state.provider().equals(provider)) {
			return null;
		}
		if (error != null) {
			if ("access_denied".equals(error)) {
				return redirect(state.redirectUri(), "error", "cancelled");
			}
			String errorCode = error.substring(0, Math.min(error.length(), 64)).replaceAll("[^A-Za-z0-9_.-]", "_");
			log.warn("소셜 로그인 공급자 오류: provider={}, error={}", provider, errorCode);
			return redirect(state.redirectUri(), "error", "failed");
		}
		try {
			if (code == null || code.isBlank()) {
				return redirect(state.redirectUri(), "error", "failed");
			}
			long userId = findOrCreate(provider, client.fetch(provider, code));
			String loginCode = store.saveCode(userId, state.codeChallenge());
			return loginCode == null ? redirect(state.redirectUri(), "error", "failed")
					: redirect(state.redirectUri(), "code", loginCode);
		}
		catch (ApiException e) {
			if (e.code() == ErrorCode.EMAIL_UNAVAILABLE) {
				return redirect(state.redirectUri(), "error", "email_in_use");
			}
			log.warn("소셜 로그인 실패: provider={}, cause={}", provider, e.getClass().getSimpleName());
		}
		catch (RestClientResponseException e) {
			log.warn("소셜 로그인 실패: provider={}, status={}", provider, e.getStatusCode().value());
		}
		catch (RuntimeException e) {
			// 외부 응답 본문·토큰·이메일은 로그에 남기지 않는다.
			log.warn("소셜 로그인 실패: provider={}, cause={}", provider, e.getClass().getSimpleName());
		}
		return redirect(state.redirectUri(), "error", "failed");
	}
	/** 서로 다른 가입·연결이 같은 인덱스 구간을 잠가 데드락이 나면, 받아 둔 프로필로 트랜잭션을 다시 실행한다. */
	private long findOrCreate(String provider, OAuthProviderClient.Profile profile) {
		for (int attempt = 1;; attempt++) {
			try {
				return users.findOrCreate(provider, profile);
			}
			catch (PessimisticLockingFailureException e) {
				if (attempt >= 3) {
					throw e;
				}
			}
		}
	}
	public AuthResponse exchange(String value, String verifier) {
		OAuthStore.LoginCode code = store.consumeCode(value);
		if (code == null || verifier == null || !MessageDigest.isEqual(
				challenge(verifier).getBytes(StandardCharsets.US_ASCII), code.codeChallenge().getBytes(StandardCharsets.US_ASCII))) {
			throw new ApiException(ErrorCode.OAUTH_CODE_INVALID);
		}
		return auth.socialLogin(code.userId());
	}
	public static String challenge(String verifier) {
		try {
			return Base64.getUrlEncoder().withoutPadding().encodeToString(
					MessageDigest.getInstance("SHA-256").digest(verifier.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
	private boolean available(String provider) {
		String id = props.clientId(provider);
		return id != null && !id.isBlank();
	}
	private void checkProvider(String provider) {
		if (!PROVIDERS.contains(provider)) {
			throw new ApiException(ErrorCode.NOT_FOUND);
		}
	}
	static String redirect(String uri, String key, String value) {
		int fragment = uri.indexOf('#');
		String target = fragment < 0 ? uri : uri.substring(0, fragment);
		String suffix = fragment < 0 ? "" : uri.substring(fragment);
		return target + (target.contains("?") ? "&" : "?") + key + "="
				+ URLEncoder.encode(value, StandardCharsets.UTF_8) + suffix;
	}
}
