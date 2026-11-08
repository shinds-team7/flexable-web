package com.flexable.web.errorlog;

import java.time.Clock;
import java.time.Duration;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.stereotype.Component;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.AttemptLimiter;
import com.flexable.web.common.ServerErrorSink;
import com.flexable.web.errorlog.ErrorReport.Kind;
import com.flexable.web.errorlog.ErrorReport.Source;

import jakarta.servlet.http.HttpServletRequest;

/**
 * 오류 기록의 입구. 기록이 실패해도 원래 요청·응답에는 영향을 주지 않는다(예외를 삼키고 로그만 남긴다).
 * 브라우저 보고는 보낸 사람(회원 번호, 비로그인이면 접속 IP)마다 10분에 30건까지만 받는다. 횟수는 서버 메모리에서만 세고 저장하지 않는다.
 */
@Component
public class ErrorRecorder implements ServerErrorSink {

	static final int MAX_REPORTS = 30;
	static final Duration WINDOW = Duration.ofMinutes(10);

	private static final Logger log = LoggerFactory.getLogger(ErrorRecorder.class);

	private final ErrorEventService service;
	/** AttemptLimiter를 "받은 건수" 세기에 쓴다(recordFailure = 한 건 받음, check = 한도 넘으면 예외). */
	private final AttemptLimiter limiter;

	public ErrorRecorder(ErrorEventService service, Clock clock) {
		this.service = service;
		this.limiter = new AttemptLimiter(MAX_REPORTS, WINDOW, clock);
	}

	/** 브라우저가 보낸 오류. 한도를 넘으면 저장하지 않고 false. */
	public boolean fromBrowser(ErrorReport report, String senderKey) {
		try {
			limiter.check(senderKey);
		}
		catch (ApiException e) {
			return false;
		}
		limiter.recordFailure(senderKey);
		save(report);
		return true;
	}

	@Override
	public void serverError(HttpServletRequest request, Throwable error) {
		try {
			save(new ErrorReport(Source.SERVER, Kind.SERVER, null, null, null, null, request.getMethod(),
					request.getRequestURI(), 500, "INTERNAL_ERROR",
					error.getClass().getSimpleName() + ": " + error.getMessage(), stackHead(error)));
		}
		catch (RuntimeException e) {
			log.warn("서버 오류 기록 준비 실패: {}", e.toString());
		}
	}

	/** 스택의 앞 부분(예외 이름과 코드 위치). 4000자는 저장 서비스가 자른다. */
	static String stackHead(Throwable error) {
		StringBuilder sb = new StringBuilder();
		sb.append(error.getClass().getName()).append('\n');
		int n = 0;
		for (StackTraceElement el : error.getStackTrace()) {
			sb.append("  at ").append(el).append('\n');
			if (++n >= 25) {
				break;
			}
		}
		return sb.toString();
	}

	private void save(ErrorReport report) {
		try {
			service.record(report);
		}
		catch (DataIntegrityViolationException e) {
			// 같은 오류가 동시에 들어와 먼저 만든 줄이 있다 → 한 번 더 시도하면 횟수만 올라간다
			retry(report);
		}
		catch (RuntimeException e) {
			log.warn("오류 기록 저장 실패: {}", e.toString());
		}
	}

	private void retry(ErrorReport report) {
		try {
			service.record(report);
		}
		catch (RuntimeException e) {
			log.warn("오류 기록 저장 실패(재시도): {}", e.toString());
		}
	}
}
