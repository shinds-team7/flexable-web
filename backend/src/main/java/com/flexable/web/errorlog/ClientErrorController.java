package com.flexable.web.errorlog;

import org.springframework.http.HttpStatus;
import org.springframework.security.core.annotation.AuthenticationPrincipal;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.web.bind.annotation.PostMapping;
import org.springframework.web.bind.annotation.RequestBody;
import org.springframework.web.bind.annotation.RequestMapping;
import org.springframework.web.bind.annotation.ResponseStatus;
import org.springframework.web.bind.annotation.RestController;

import com.flexable.web.errorlog.ErrorReport.Kind;
import com.flexable.web.errorlog.ErrorReport.Source;

import jakarta.servlet.http.HttpServletRequest;
import jakarta.validation.Valid;
import jakarta.validation.constraints.Max;
import jakarta.validation.constraints.Min;
import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.NotNull;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

/**
 * 브라우저가 겪은 오류를 받는다. 로그인 없이도 보낼 수 있고, 유효한 토큰이 있으면 회원 번호를 함께 남긴다.
 * 형식이 맞으면(한도를 넘어 버려도) 204. 화면은 결과를 기다리지 않는다.
 */
@RestController
@RequestMapping("/api/v1/client-errors")
public class ClientErrorController {

	private final ErrorRecorder recorder;

	public ClientErrorController(ErrorRecorder recorder) {
		this.recorder = recorder;
	}

	public record ClientErrorRequest(
			@NotNull(message = "오류 종류를 확인해 주세요") ClientKind kind,
			@NotBlank(message = "오류 내용을 확인해 주세요") @Size(max = 2000, message = "오류 내용이 너무 길어요") String message,
			@Size(max = 8000, message = "오류 위치가 너무 길어요") String stack,
			@Size(max = 100, message = "화면 경로가 너무 길어요") String screen,
			@Pattern(regexp = "GET|POST|PUT|PATCH|DELETE", message = "요청 방식을 확인해 주세요") String method,
			@Size(max = 300, message = "요청 경로가 너무 길어요") String path,
			@Min(value = 0, message = "상태 코드를 확인해 주세요") @Max(value = 599, message = "상태 코드를 확인해 주세요") Integer status,
			@Size(max = 40, message = "오류 코드가 너무 길어요") String code,
			@Size(max = 20, message = "버전이 너무 길어요") String appVersion) {
	}

	/** 브라우저 쪽 종류. SERVER는 서버만 쓴다. */
	public enum ClientKind {
		API, CRASH, JS
	}

	@PostMapping
	@ResponseStatus(HttpStatus.NO_CONTENT)
	void report(@AuthenticationPrincipal Jwt jwt, @Valid @RequestBody ClientErrorRequest req, HttpServletRequest http) {
		Long userId = jwt == null ? null : Long.parseLong(jwt.getSubject());
		String sender = userId != null ? "user:" + userId : "ip:" + http.getRemoteAddr();
		recorder.fromBrowser(new ErrorReport(Source.WEB, Kind.valueOf(req.kind().name()), userId, req.appVersion(), "web",
				req.screen(), req.method(), req.path(), req.status(), req.code(), req.message(), req.stack()), sender);
	}
}
