package com.flexable.web.auth;

import java.time.Clock;
import java.time.Instant;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.user.UserService;

/**
 * 소셜 프로필로 웹 회원을 찾거나 만든다. 웹 계정 안에서만 본다: 같은 이메일의 앱 계정은 보지 않는다(04 §4).
 */
@Service
public class OAuthUserService {

	private final UserService users;
	private final CredentialRepository credentials;
	private final IdentityRepository identities;
	private final Clock clock;

	public OAuthUserService(UserService users, CredentialRepository credentials, IdentityRepository identities, Clock clock) {
		this.users = users;
		this.credentials = credentials;
		this.identities = identities;
		this.clock = clock;
	}

	@Transactional
	public long findOrCreate(String provider, OAuthProviderClient.Profile profile) {
		var existing = identities.findByProviderAndProviderUserId(provider, profile.providerUserId());
		if (existing.isPresent()) {
			return existing.get().getUserId();
		}
		Instant now = clock.instant();
		String email = profile.emailVerified() && profile.email() != null && !profile.email().isBlank()
				? UserService.normalizeEmail(profile.email()) : null;
		Long ownerId = email == null ? null : users.findIdByEmail(email).orElse(null);
		if (ownerId != null) {
			return link(ownerId, provider, profile.providerUserId(), email, now);
		}
		// 로그인 화면의 동의 고지("계속하면 … 동의하는 것으로 봐요")가 소셜 가입의 동의 근거다.
		long userId = users.register(email, now);
		credentials.save(new Credential(userId, null, now));
		identities.saveAndFlush(new Identity(userId, provider, profile.providerUserId(), email, now));
		return userId;
	}

	/**
	 * 공급자가 확인한 이메일과 같은 웹 계정에 로그인 수단을 붙인다(project2와 같은 규칙). 비밀번호는 지우지 않지만 소셜이 붙은
	 * 계정은 이메일 로그인을 받지 않는다(AuthService.login). 이메일 가입은 메일 인증을 하지 않으므로 남의 주소로 미리 가입해 둔
	 * 사람이 계속 들어오지 못하게 기존 웹 세션도 끊는다. 같은 공급자의 다른 계정이 이미 붙어 있으면 주인을 알 수 없어 붙이지 않는다.
	 * 로그인 수단 행을 잠근 채로 확인하므로 같은 계정에 대한 연결 요청은 하나씩 처리된다.
	 */
	private long link(long ownerId, String provider, String providerUserId, String email, Instant now) {
		Credential credential = credentials.findWithLockByUserId(ownerId)
			.orElseThrow(() -> new ApiException(ErrorCode.EMAIL_UNAVAILABLE));
		boolean taken = identities.findWithLockByUserId(ownerId).stream().anyMatch(i -> provider.equals(i.getProvider()));
		if (taken) {
			throw new ApiException(ErrorCode.EMAIL_UNAVAILABLE);
		}
		if (credential.getPasswordHash() != null) {
			credential.revokeTokens(now);
		}
		identities.saveAndFlush(new Identity(ownerId, provider, providerUserId, email, now));
		return ownerId;
	}
}
