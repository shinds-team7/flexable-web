package com.flexable.web.auth;

import java.net.URI;
import java.util.List;
import java.util.Map;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.http.ResponseEntity;
import org.springframework.web.bind.annotation.GetMapping;
import org.springframework.web.bind.annotation.PathVariable;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.RequestParam;
import org.springframework.web.bind.annotation.RestController;
import com.flexable.web.auth.AuthDtos.AuthResponse;

@RestController
@RequestMapping("/api/v1/auth/oauth")
public class OAuthController {
	private final OAuthService oauth;

	public OAuthController(OAuthService oauth) {
		this.oauth = oauth;
	}
	@GetMapping("/providers")
	Map<String, List<String>> providers() {
		return Map.of("providers", oauth.providers());
	}
	@GetMapping("/{provider}/start")
	ResponseEntity<Void> start(@PathVariable String provider,
			@RequestParam(required = false) String redirectUri, @RequestParam(required = false) String codeChallenge) {
		return redirect(oauth.start(provider, redirectUri, codeChallenge));
	}
	@GetMapping("/{provider}/callback")
	ResponseEntity<?> callback(@PathVariable String provider, @RequestParam(required = false) String code,
			@RequestParam(required = false) String state, @RequestParam(required = false) String error) {
		String target = oauth.callback(provider, code, state, error);
		return target == null
				? ResponseEntity.badRequest().contentType(MediaType.parseMediaType("text/html;charset=UTF-8"))
					.body("로그인 요청이 만료됐어요. 처음 화면으로 돌아가 다시 시도해 주세요.")
				: redirect(target);
	}
	@PostMapping("/exchange")
	AuthResponse exchange(@RequestBody ExchangeRequest req) {
		return oauth.exchange(req.code(), req.codeVerifier());
	}
	public record ExchangeRequest(String code, String codeVerifier) {
	}
	private static ResponseEntity<Void> redirect(String target) {
		return ResponseEntity.status(HttpStatus.FOUND).location(URI.create(target))
			.header("Cache-Control", "no-store").build();
	}
}
