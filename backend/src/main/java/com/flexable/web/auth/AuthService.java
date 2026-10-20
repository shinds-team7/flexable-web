package com.flexable.web.auth;

import java.time.Clock;
import java.time.Instant;

import org.springframework.security.crypto.password.PasswordEncoder;
import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.auth.AuthDtos.AuthResponse;
import com.flexable.web.auth.AuthDtos.LoginRequest;
import com.flexable.web.auth.AuthDtos.SignupRequest;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.common.Times;
import com.flexable.web.member.MemberService;
import com.flexable.web.member.MemberWithdrawalListener;

/**
 * 웹 계정의 가입·로그인·로그아웃·탈퇴. 앱 계정과 섞지 않는다: 같은 이메일의 앱 계정이 있어도 확인하거나 합치지 않는다(04 §4).
 */
@Service
public class AuthService implements MemberWithdrawalListener {

	private final MemberService members;
	private final CredentialRepository credentials;
	private final PasswordEncoder passwordEncoder;
	private final TokenService tokens;
	private final LoginAttemptLimiter limiter;
	private final Clock clock;
	/** 없는 이메일로 로그인할 때도 같은 시간만큼 해시 비교를 하기 위한 값 */
	private final String dummyHash;

	public AuthService(MemberService members, CredentialRepository credentials, PasswordEncoder passwordEncoder,
			TokenService tokens, LoginAttemptLimiter limiter, Clock clock) {
		this.members = members;
		this.credentials = credentials;
		this.passwordEncoder = passwordEncoder;
		this.tokens = tokens;
		this.limiter = limiter;
		this.clock = clock;
		this.dummyHash = passwordEncoder.encode("not-a-real-password-0");
	}

	@Transactional
	public AuthResponse signup(SignupRequest req) {
		Instant now = clock.instant();
		long memberId = members.register(req.email(), now);
		Credential credential = credentials.save(new Credential(memberId, passwordEncoder.encode(req.password()), now));
		return respond(credential);
	}

	@Transactional(readOnly = true)
	public AuthResponse login(LoginRequest req) {
		String email = MemberService.normalizeEmail(req.email());
		limiter.check(email);
		Credential credential = members.findIdByEmail(email).flatMap(credentials::findById).orElse(null);
		boolean ok = passwordEncoder.matches(req.password(), credential == null ? dummyHash : credential.getPasswordHash());
		if (credential == null || !ok) {
			limiter.recordFailure(email);
			throw new ApiException(ErrorCode.INVALID_CREDENTIALS);
		}
		limiter.reset(email);
		return respond(credential);
	}

	/** 이 회원의 웹 토큰을 모든 기기에서 끝낸다. 앱 세션·앱 연동은 그대로다. */
	@Transactional
	public void logout(long memberId) {
		Instant now = clock.instant();
		credentials.findWithLockByMemberId(memberId).ifPresent(c -> c.revokeTokens(now));
	}

	@Transactional
	public void withdraw(long memberId, int tokenVersion, String password) {
		Credential credential = credentials.findWithLockByMemberId(memberId)
			.orElseThrow(() -> new ApiException(ErrorCode.UNAUTHORIZED));
		// 인증 필터를 지난 뒤 다른 요청의 로그아웃으로 폐기된 토큰이면 탈퇴하지 않는다.
		if (credential.getTokenVersion() != tokenVersion) {
			throw new ApiException(ErrorCode.UNAUTHORIZED);
		}
		if (password == null || password.isBlank()) {
			throw ApiException.invalid("password", "비밀번호를 입력해 주세요");
		}
		if (!passwordEncoder.matches(password, credential.getPasswordHash())) {
			throw new ApiException(ErrorCode.INVALID_CREDENTIALS, "비밀번호가 맞지 않아요");
		}
		members.withdraw(memberId);
	}

	/** member.withdraw가 회원 행을 지우기 전에 부른다. 로그인 수단을 지우면 남은 토큰도 함께 무효가 된다. */
	@Override
	public void onWithdraw(long memberId) {
		credentials.deleteById(memberId);
	}

	private AuthResponse respond(Credential credential) {
		TokenService.IssuedToken token = tokens.issue(credential.getMemberId(), credential.getTokenVersion());
		return new AuthResponse(token.value(), Times.at(token.expiresAt()), members.profile(credential.getMemberId()));
	}
}
