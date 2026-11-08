package com.flexable.web.common;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 처리하지 못한 서버 예외(500)를 받아 기록하는 쪽이 구현한다(errorlog). common은 다른 패키지에 의존하지 않으므로
 * GlobalExceptionHandler가 이 인터페이스로 부른다. 구현은 실패해도 예외를 던지지 않는다.
 */
public interface ServerErrorSink {

	void serverError(HttpServletRequest request, Throwable error);
}
