package com.flexable.web.applink;

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

import com.flexable.web.applink.AppLinkDtos.AppLinkResponse;
import com.flexable.web.applink.AppLinkDtos.LinkRequest;

import jakarta.validation.Valid;

@RestController
@RequestMapping("/api/v1/app-link")
public class AppLinkController {

	private final AppLinkService appLinks;

	public AppLinkController(AppLinkService appLinks) {
		this.appLinks = appLinks;
	}

	/** 저장한 값만 읽는다(앱 서버 호출·DB 쓰기 없음). 다시 받을 때가 되면 sync.due=true. */
	@GetMapping
	AppLinkResponse status(@AuthenticationPrincipal Jwt jwt) {
		return appLinks.status(userId(jwt));
	}

	/** 앱 서버에서 회원 정보·시드머니를 다시 받는다. 다시 받을 때가 아니면 저장한 값을 준다. */
	@PostMapping("/refresh")
	AppLinkResponse refresh(@AuthenticationPrincipal Jwt jwt) {
		return appLinks.refresh(userId(jwt));
	}

	@PostMapping
	@ResponseStatus(HttpStatus.CREATED)
	AppLinkResponse link(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody LinkRequest req) {
		return appLinks.link(userId(jwt), req.code());
	}

	@DeleteMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void unlink(@AuthenticationPrincipal Jwt jwt) {
		appLinks.unlink(userId(jwt));
	}

	/** 토큰 검사(auth)를 지난 요청의 sub. applink는 auth에 의존하지 않으므로 직접 읽는다. */
	private static long userId(Jwt jwt) {
		return Long.parseLong(jwt.getSubject());
	}
}
