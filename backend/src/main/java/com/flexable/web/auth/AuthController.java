package com.flexable.web.auth;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.auth.AuthDtos.AuthResponse;
import com.flexable.web.auth.AuthDtos.LoginRequest;
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
		auth.logout(CurrentMember.id(jwt));
	}

	/** 웹 탈퇴. GET /me(회원 정보)는 member 패키지에 있다. */
	@DeleteMapping("/me")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void withdraw(@AuthenticationPrincipal Jwt jwt, @RequestBody WithdrawRequest req) {
		auth.withdraw(CurrentMember.id(jwt), CurrentMember.tokenVersion(jwt), req.password());
	}
}
