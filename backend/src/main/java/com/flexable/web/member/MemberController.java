package com.flexable.web.member;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PatchMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.member.MemberDtos.MemberResponse;
import com.flexable.web.member.MemberDtos.SettingsPatch;
import com.flexable.web.member.MemberDtos.SettingsResponse;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/me")
public class MemberController {

	private final MemberService members;

	public MemberController(MemberService members) {
		this.members = members;
	}

	@GetMapping
	MemberResponse me(@AuthenticationPrincipal Jwt jwt) {
		return members.profile(memberId(jwt));
	}

	@GetMapping("/settings")
	SettingsResponse settings(@AuthenticationPrincipal Jwt jwt) {
		return members.settings(memberId(jwt));
	}

	@PatchMapping("/settings")
	SettingsResponse updateSettings(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody SettingsPatch patch) {
		return members.updateSettings(memberId(jwt), patch);
	}

	/** 토큰 검사(auth)를 지난 요청의 sub. member는 auth에 의존하지 않으므로 직접 읽는다. */
	private static long memberId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}
}
