package com.flexable.web.auth;

import java.time.Clock;
import java.time.Instant;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import org.springframework.web.client.RestClientResponseException;

import com.flexable.web.auth.AuthDtos.AuthResponse;
import com.flexable.web.auth.AuthDtos.LoginRequest;
import com.flexable.web.auth.AuthDtos.MeResponse;
import com.flexable.web.auth.AuthDtos.SignupRequest;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.common.Times;
import com.flexable.web.user.UserService;
import com.flexable.web.user.UserWithdrawalListener;

/**
 * 웹 계정의 가입·로그인·로그아웃·탈퇴. 앱 계정과 섞지 않는다: 같은 이메일의 앱 계정이 있어도 확인하거나 합치지 않는다(04 §4).
 */
@Service
public class AuthService implements UserWithdrawalListener {

	private static final Logger log = LoggerFactory.getLogger(AuthService.class);
	static final String WITHDRAW_CONFIRM = "탈퇴";

	private final UserService users;
	private final CredentialRepository credentials;
	private final IdentityRepository identities;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokens;
	private final LoginAttemptLimiter limiter;
	private final OAuthProviderClient oauthClient;
	private final OAuthProperties oauthProps;
	private final Clock clock;
	/** 없는 이메일로 로그인할 때도 같은 시간만큼 해시 비교를 하기 위한 값 */
	private final String dummyHash;

	public AuthService(UserService users, CredentialRepository credentials, IdentityRepository identities,
			PasswordEncoder passwordEncoder, TokenService tokens, LoginAttemptLimiter limiter,
			OAuthProviderClient oauthClient, OAuthProperties oauthProps, Clock clock) {
		this.users = users;
		this.credentials = credentials;
		this.identities = identities;
		this.passwordEncoder = passwordEncoder;
		this.tokens = tokens;
		this.limiter = limiter;
		this.oauthClient = oauthClient;
		this.oauthProps = oauthProps;
		this.clock = clock;
		this.dummyHash = passwordEncoder.encode("not-a-real-password-0");
	}

	@Transactional
	public AuthResponse signup(SignupRequest req) {
		Instant now = clock.instant();
		long userId = users.register(req.email(), now);
		Credential credential = credentials.save(new Credential(userId, passwordEncoder.encode(req.password()), now));
		return respond(credential);
	}

	@Transactional(readOnly = true)
	public AuthResponse login(LoginRequest req) {
		String email = UserService.normalizeEmail(req.email());
		limiter.check(email);
		Credential credential = users.findIdByEmail(email).flatMap(credentials::findById).orElse(null);
		var social = credential == null ? null : identities.findFirstByUserIdOrderByIdAsc(credential.getUserId()).orElse(null);
		if (social != null) {
			// 같은 이메일에 소셜 로그인이 붙으면 비밀번호가 맞아도 그 방법으로 돌려보낸다(선가입 계정 차단).
			limiter.recordFailure(email);
			String name = providerName(social.getProvider());
			throw new ApiException(ErrorCode.SOCIAL_ACCOUNT, name + "로 가입한 계정이에요. " + name + "로 로그인해 주세요",
					Map.of("provider", social.getProvider()));
		}
		String hash = credential == null ? null : credential.getPasswordHash();
		boolean ok = passwordEncoder.matches(req.password(), hash == null ? dummyHash : hash);
		if (hash == null || !ok) {
			limiter.recordFailure(email);
			throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
		}
		limiter.reset(email);
		return respond(credential);
	}

	@Transactional(readOnly = true)
	public AuthResponse socialLogin(long userId) {
		return respond(find(userId));
	}

	@Transactional(readOnly = true)
	public MeResponse me(long userId) {
		return meResponse(find(userId));
	}

	/** 이 회원의 웹 토큰을 모든 기기에서 끝낸다. 앱 세션·앱 연동은 그대로다. */
	@Transactional
	public void logout(long userId) {
		Instant now = clock.instant();
		credentials.findWithLockByUserId(userId).ifPresent(c -> c.revokeTokens(now));
	}

	/** 이메일 계정은 비밀번호로, 소셜이 붙은 계정은 비밀번호를 쓸 수 없으므로 확인 문구로 본인 확인을 한다. */
	@Transactional
	public void withdraw(long userId, int tokenVersion, String password, String confirm) {
		Credential credential = credentials.findWithLockByUserId(userId)
			.orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
		// 인증 필터를 지난 뒤 로그아웃·소셜 연결로 폐기된 토큰이면 탈퇴하지 않는다.
		if (credential.getTokenVersion() != tokenVersion) {
			throw new ApiException(ErrorCode.UNAUTHORIZED);
		}
		var linked = identities.findWithLockByUserId(userId);
		if (linked.isEmpty()) {
			if (password == null || password.isBlank()) {
				throw ApiException.invalid("password", "비밀번호를 입력해 주세요");
			}
			if (credential.getPasswordHash() == null || !passwordEncoder.matches(password, credential.getPasswordHash())) {
				throw new ApiException(ErrorCode.INVALID_CREDENTIALS, "비밀번호가 맞지 않아요");
			}
		}
		else if (!WITHDRAW_CONFIRM.equals(confirm)) {
			throw ApiException.invalid("confirm", "확인 문구 '탈퇴'를 입력해 주세요");
		}
		String adminKey = oauthProps.kakao().adminKey();
		if (adminKey != null && !adminKey.isBlank()) {
			linked.stream().filter(i -> "kakao".equals(i.getProvider())).forEach(i -> unlinkKakao(i.getProviderUserId()));
		}
		users.withdraw(userId);
	}

	/** user.withdraw가 회원 행을 지우기 전에 부른다. 로그인 수단을 지우면 남은 토큰도 함께 무효가 된다. */
	@Override
	public void onWithdraw(long userId) {
		identities.deleteByUserId(userId);
		credentials.deleteById(userId);
	}

	private void unlinkKakao(String providerUserId) {
		try {
			oauthClient.unlinkKakao(providerUserId);
		}
		catch (RestClientResponseException e) {
			log.warn("카카오 연결 끊기 실패: provider=kakao, status={}", e.getStatusCode().value());
		}
		catch (RuntimeException e) {
			log.warn("카카오 연결 끊기 실패: cause={}", e.getClass().getSimpleName());
		}
	}

	private Credential find(long userId) {
		return credentials.findById(userId).orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
	}

	private AuthResponse respond(Credential credential) {
		TokenService.IssuedToken token = tokens.issue(credential.getUserId(), credential.getTokenVersion());
		return new AuthResponse(token.value(), Times.at(token.expiresAt()), meResponse(credential));
	}

	/** 소셜 로그인이 붙어 있으면 비밀번호가 남아 있어도 그 방법으로만 들어온다. */
	private MeResponse meResponse(Credential credential) {
		String provider = identities.findFirstByUserIdOrderByIdAsc(credential.getUserId())
			.map(Identity::getProvider).orElse("email");
		boolean hasPassword = "email".equals(provider) && credential.getPasswordHash() != null;
		return MeResponse.of(users.profile(credential.getUserId()), provider, hasPassword);
	}

	private static String providerName(String provider) {
		return "kakao".equals(provider) ? "카카오" : "Google";
	}
}
