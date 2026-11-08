package com.flexable.web.errorlog;

/**
 * 저장하기 전의 오류 한 건. 글자는 ErrorEventService가 길이를 자르고 가린 뒤 저장한다.
 * source: 누가 보냈나(WEB 브라우저, SERVER 서버 500). kind: API 요청 실패, CRASH 화면 오류, JS 그 밖의 브라우저 오류, SERVER 서버 예외.
 */
public record ErrorReport(Source source, Kind kind, Long userId, String appVersion, String platform, String screen,
		String method, String path, Integer status, String code, String message, String stack) {

	public enum Source {
		WEB, SERVER
	}

	public enum Kind {
		API, CRASH, JS, SERVER
	}
}
