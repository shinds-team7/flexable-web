package com.flexable.web.common;

import org.springframework.http.HttpStatus;

/** 오류 응답의 code. 이름과 응답 형식은 project2와 같게 둔다(웹 화면이 같은 처리를 쓴다). */
public enum ErrorCode {
	VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "입력한 내용을 확인해 주세요"),
	UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "다시 로그인해 주세요"),
	INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 맞지 않아요"),
	SOCIAL_ACCOUNT(HttpStatus.UNAUTHORIZED, "카카오·Google로 가입한 계정이에요. 가입한 방법으로 로그인해 주세요"),
	OAUTH_CODE_INVALID(HttpStatus.UNAUTHORIZED, "로그인 시간이 지났어요. 다시 시도해 주세요"),
	NOT_FOUND(HttpStatus.NOT_FOUND, "찾을 수 없어요"),
	EMAIL_UNAVAILABLE(HttpStatus.CONFLICT, "이 이메일로 가입할 수 없어요. 로그인해 주세요"),
	TOO_MANY_ATTEMPTS(HttpStatus.TOO_MANY_REQUESTS, "잠시 후 다시 시도해 주세요"),
	MARKET_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "주가를 불러오지 못했어요"),
	// 앱 연동(applink). LINK_CODE_INVALID는 앱 서버와 같은 이름을 쓴다.
	LINK_CODE_INVALID(HttpStatus.BAD_REQUEST, "코드가 맞지 않거나 이미 쓴 코드예요. 앱에서 새 코드를 받아 입력해 주세요"),
	APP_LINK_EXISTS(HttpStatus.CONFLICT, "이미 앱 계정과 연동돼 있어요. 연동을 해제한 뒤 다시 시도해 주세요"),
	APP_LINK_IN_PROGRESS(HttpStatus.CONFLICT, "앱 연동을 처리하고 있어요. 잠시 후 다시 확인해 주세요"),
	APP_LINK_RESULT_UNKNOWN(HttpStatus.BAD_GATEWAY,
			"연동 결과를 확인하지 못했어요. 앱 설정의 웹 연동 목록을 확인하고, 새 코드를 받아 다시 시도해 주세요"),
	APP_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "앱 서버에 연결하지 못했어요. 잠시 후 다시 시도해 주세요"),
	INTERNAL_ERROR(HttpStatus.INTERNAL_SERVER_ERROR, "일시적인 오류가 발생했어요. 잠시 후 다시 시도해 주세요");

	private final HttpStatus status;
	private final String message;

	ErrorCode(HttpStatus status, String message) {
		this.status = status;
		this.message = message;
	}

	public HttpStatus status() {
		return status;
	}

	public String message() {
		return message;
	}
}
