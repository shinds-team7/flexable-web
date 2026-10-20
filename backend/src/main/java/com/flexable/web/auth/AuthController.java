package com.flexable.web.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.auth.AuthDtos.AuthResponse;
import com.flexable.web.auth.AuthDtos.LoginRequest;
import com.flexable.web.auth.AuthDtos.MeResponse;
import com.flexable.web.auth.AuthDtos.SignupRequest;
import com.flexable.web.auth.AuthDtos.WithdrawRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1")
public class AuthController {

	private final AuthService auth;

	public AuthController(AuthService auth) {
		this.auth = auth;
	}

	@PostMapping("/auth/signup")
	@ResponseStatus(HttpStatus.CREATED)
	AuthResponse signup(@Valid @RequestBody SignupRequest req) {
		return auth.signup(req);
	}

	@PostMapping("/auth/login")
	AuthResponse login(@Valid @RequestBody LoginRequest req) {
		return auth.login(req);
	}

	@PostMapping("/auth/logout")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void logout(@AuthenticationPrincipal Jwt jwt) {
		auth.logout(CurrentUser.id(jwt));
	}

	/** 회원 정보(user) + 로그인 방법(auth). 설정은 user 패키지의 /me/settings. */
	@GetMapping("/me")
	MeResponse me(@AuthenticationPrincipal Jwt jwt) {
		return auth.me(CurrentUser.id(jwt));
	}

	@DeleteMapping("/me")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void withdraw(@AuthenticationPrincipal Jwt jwt, @RequestBody WithdrawRequest req) {
		auth.withdraw(CurrentUser.id(jwt), CurrentUser.tokenVersion(jwt), req.password(), req.confirm());
	}
}
