package com.flexable.web.applink;

/**
 * 앱 서버 호출 실패. 원인 예외는 요청 주소(linkId 포함)를 담을 수 있어 붙이지 않고 종류만 남긴다.
 */
public class AppApiException extends RuntimeException {

	public enum Kind {
		/** 400 LINK_CODE_INVALID: 코드 없음·만료·이미 사용 */
		CODE_INVALID,
		/** 404 LINK_NOT_FOUND: 앱에서 해제했거나 앱 탈퇴 */
		LINK_NOT_FOUND,
		/** 404 BUDGET_NOT_SET: 앱 예산 설정 전(연동은 유지) */
		BUDGET_NOT_SET,
		/** 429: 앱 서버 전체 시도 제한 */
		RATE_LIMITED,
		/** 401·403: 서비스 키 설정 오류 */
		AUTH_FAILED,
		/** 주소·서비스 키가 설정되지 않음 */
		NOT_CONFIGURED,
		/** 요청이 처리되지 않았거나(연결 실패) 조회가 실패함. 다시 시도해도 된다 */
		UNAVAILABLE,
		/** 연동 생성 요청을 보낸 뒤 응답을 받지 못함. 코드가 쓰였는지 알 수 없다 */
		RESULT_UNKNOWN
	}

	private final Kind kind;
	private final long retryAfterSeconds;

	public AppApiException(Kind kind) {
		this(kind, 0);
	}

	public AppApiException(Kind kind, long retryAfterSeconds) {
		super(kind.name(), null, false, false);
		this.kind = kind;
		this.retryAfterSeconds = retryAfterSeconds;
	}

	public Kind kind() {
		return kind;
	}

	public long retryAfterSeconds() {
		return retryAfterSeconds;
	}
}
