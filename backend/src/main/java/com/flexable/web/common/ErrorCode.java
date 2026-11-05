package com.flexable.web.common;

import org.springframework.http.HttpStatus;

/** 오류 응답의 code. 이름과 응답 형식은 project2와 같게 둔다(웹 화면이 같은 처리를 쓴다). */
public enum ErrorCode {
    PRACTICE_CONFLICT(HttpStatus.CONFLICT, "진행 상태가 바뀌었어요. 현재 상태를 다시 확인해 주세요"),
    PRACTICE_EXPIRED(HttpStatus.GONE, "연습 시간이 만료되었어요. 새로 시작해 주세요"),
    PRACTICE_UNAVAILABLE(HttpStatus.SERVICE_UNAVAILABLE, "이 업종의 시세·사건 자료를 준비하고 있어요"),
    PRACTICE_CAPACITY(HttpStatus.SERVICE_UNAVAILABLE, "연습 중인 사용자가 많아요. 잠시 후 다시 시작해 주세요"),
	VALIDATION_FAILED(HttpStatus.BAD_REQUEST, "입력한 내용을 확인해 주세요"),
	UNAUTHORIZED(HttpStatus.UNAUTHORIZED, "다시 로그인해 주세요"),
	INVALID_CREDENTIALS(HttpStatus.UNAUTHORIZED, "이메일 또는 비밀번호가 맞지 않아요"),
	SOCIAL_ACCOUNT(HttpStatus.UNAUTHORIZED, "카카오·Google로 가입한 계정이에요. 가입한 방법으로 로그인해 주세요"),
	OAUTH_CODE_INVALID(HttpStatus.UNAUTHORIZED, "로그인 시간이 지났어요. 다시 시도해 주세요"),
	NOT_FOUND(HttpStatus.NOT_FOUND, "찾을 수 없어요"),
	GOAL_CHANGED(HttpStatus.CONFLICT, "목표가 바뀌었어요. 다시 확인해 주세요"),
	GOAL_SCENARIO_LIMIT(HttpStatus.CONFLICT, "시나리오는 5개까지 저장할 수 있어요. 지운 뒤 다시 저장해 주세요"),
	GOAL_SCENARIO_EXPIRED(HttpStatus.CONFLICT, "계산한 지 오래돼서 저장할 수 없어요. 다시 계산해 주세요"),
	// 가상 시뮬레이션 대회(policies §8-8)
	CONTEST_CLOSED(HttpStatus.CONFLICT, "대회 기간이 아니에요. 새 대회는 매달 1일 00시에 열려요"),
	CONTEST_NOT_JOINED(HttpStatus.CONFLICT, "배치고사를 마치면 대회 판을 시작할 수 있어요"),
	CONTEST_ALREADY_JOINED(HttpStatus.CONFLICT, "이번 대회 배치고사는 이미 마쳤어요"),
	CONTEST_LIQUIDATED(HttpStatus.CONFLICT, "잔액이 100만 원 미만으로 끝나 이번 대회는 더 할 수 없어요"),
	CONTEST_DAILY_LIMIT(HttpStatus.TOO_MANY_REQUESTS, "오늘은 10판을 모두 했어요. 내일 00시부터 다시 할 수 있어요"),
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
