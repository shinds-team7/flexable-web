package com.flexable.web.virtualsim;

import java.time.Clock;
import java.time.Duration;

import org.springframework.stereotype.Component;

import com.flexable.web.common.AttemptLimiter;

/**
 * 가상 시뮬레이션 시작 횟수 제한(클라이언트 IP별 10분에 20번). 로그인 없이 열린 /virtual-sim/start로 한 클라이언트가
 * 전체 세션 상한(1,000)을 채워 다른 사용자가 503을 받지 않게 한다. 넘으면 429 TOO_MANY_ATTEMPTS(+retryAfterSeconds).
 * 같은 startId 재전송은 새 세션이 아니라 세지 않는다. IP는 서버 메모리에서만 세고 DB·로그에 남기지 않는다(동작은 common.AttemptLimiter).
 */
@Component
public class VirtualSimStartLimiter extends AttemptLimiter {

	static final int MAX_STARTS = 20;
	static final Duration WINDOW = Duration.ofMinutes(10);

	public VirtualSimStartLimiter(Clock clock) {
		super(MAX_STARTS, WINDOW, clock);
	}
}
