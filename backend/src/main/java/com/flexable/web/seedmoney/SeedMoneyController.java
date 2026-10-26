package com.flexable.web.seedmoney;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.DeleteMapping;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PutMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.seedmoney.SeedMoneyDtos.ManualRequest;
import com.flexable.web.seedmoney.SeedMoneyDtos.SeedMoneyResponse;

/** 웹 시드머니. 앱 연동 값(applink 공개 서비스로 읽음)과 웹에서 직접 고친 값(manual)을 함께 내보낸다. */
@RestController
@RequestMapping("/api/v1/me/seed-money")
public class SeedMoneyController {

	private final SeedMoneyService seedMoney;

	public SeedMoneyController(SeedMoneyService seedMoney) {
		this.seedMoney = seedMoney;
	}

	@GetMapping
	SeedMoneyResponse get(@AuthenticationPrincipal Jwt jwt) {
		return seedMoney.get(userId(jwt));
	}

	/** 직접 고치기(확정 15). 같은 회원은 덮어쓴다. 응답은 GET과 같다. */
	@PutMapping("/manual")
	SeedMoneyResponse putManual(@AuthenticationPrincipal Jwt jwt, @RequestBody ManualRequest req) {
		return seedMoney.putManual(userId(jwt), req.total());
	}

	/** 앱 기록 기준으로 되돌리기. 없어도 204. */
	@DeleteMapping("/manual")
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void deleteManual(@AuthenticationPrincipal Jwt jwt) {
		seedMoney.deleteManual(userId(jwt));
	}

	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}
}
