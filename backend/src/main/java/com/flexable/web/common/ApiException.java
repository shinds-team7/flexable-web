package com.flexable.web.common;

import java.util.Map;

public class ApiException extends RuntimeException {

	private final ErrorCode code;
	private final Map<String, Object> extra;

	public ApiException(ErrorCode code) {
		this(code, code.message(), Map.of());
	}

	public ApiException(ErrorCode code, String message) {
		this(code, message, Map.of());
	}

	public ApiException(ErrorCode code, String message, Map<String, Object> extra) {
		super(message);
		this.code = code;
		this.extra = extra;
	}

	public ErrorCode code() {
		return code;
	}

	public Map<String, Object> extra() {
		return extra;
	}

	public static ApiException invalid(String field, String message) {
		return new ApiException(ErrorCode.VALIDATION_FAILED, message, Map.of("fields", Map.of(field, message)));
	}
}
