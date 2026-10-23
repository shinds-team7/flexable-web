package com.flexable.web.seedmoney;

import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.seedmoney.SeedMoneyDtos.SeedMoneyResponse;

/** 웹 시드머니. 지금은 앱 연동 값만 있다(웹 직접 입력 저장은 아직 없음). 앱 값은 applink 공개 서비스로 읽는다. */
@RestController
@RequestMapping("/api/v1/me/seed-money")
public class SeedMoneyController {

	private final SeedMoneyService seedMoney;

	public SeedMoneyController(SeedMoneyService seedMoney) {
		this.seedMoney = seedMoney;
	}

	@GetMapping
	SeedMoneyResponse get(@AuthenticationPrincipal Jwt jwt) {
		return seedMoney.get(Long.parseLong(jwt.getSubject()));
	}
}
