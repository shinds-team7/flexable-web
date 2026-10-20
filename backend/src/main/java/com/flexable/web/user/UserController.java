package com.flexable.web.user;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.user.UserDtos.UserResponse;
import com.flexable.web.user.UserDtos.SettingsPatch;
import com.flexable.web.user.UserDtos.SettingsResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/me")
public class UserController {

	private final UserService users;

	public UserController(UserService users) {
		this.users = users;
	}

	@GetMapping
	UserResponse me(@AuthenticationPrincipal Jwt jwt) {
		return users.profile(userId(jwt));
	}

	@GetMapping("/settings")
	SettingsResponse settings(@AuthenticationPrincipal Jwt jwt) {
		return users.settings(userId(jwt));
	}

	@PatchMapping("/settings")
	SettingsResponse updateSettings(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsPatch patch) {
		return users.updateSettings(userId(jwt), patch);
	}

	/** 토큰 검사(auth)를 지난 요청의 sub. user는 auth에 의존하지 않으므로 직접 읽는다. */
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}
}
