package com.flexable.web.common;

import java.util.LinkedHashMap;
import java.util.Map;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.http.ResponseEntity;
import org.springframework.http.converter.HttpMessageNotReadableException;
import org.springframework.validation.FieldError;
import org.springframework.web.HttpRequestMethodNotSupportedException;
import org.springframework.web.bind.MethodArgumentNotValidException;
import org.springframework.web.bind.MissingRequestHeaderException;
import org.springframework.web.bind.MissingServletRequestParameterException;
import org.springframework.web.bind.annotation.ExceptionHandler;
import org.springframework.web.bind.annotation.RestControllerAdvice;
import org.springframework.web.method.annotation.MethodArgumentTypeMismatchException;
import org.springframework.web.servlet.resource.NoResourceFoundException;

@RestControllerAdvice
public class GlobalExceptionHandler {

	private static final Logger log = LoggerFactory.getLogger(GlobalExceptionHandler.class);

	@ExceptionHandler(ApiException.class)
	ResponseEntity<Map<String, Object>> handleApi(ApiException e) {
		return ResponseEntity.status(e.code().status()).body(ErrorResponses.body(e.code(), e.getMessage(), e.extra()));
	}

	@ExceptionHandler(MethodArgumentNotValidException.class)
	ResponseEntity<Map<String, Object>> handleInvalid(MethodArgumentNotValidException e) {
		Map<String, String> fields = new LinkedHashMap<>();
		for (FieldError fe : e.getBindingResult().getFieldErrors()) {
			// 목록 원소 오류(seenTours[0])는 목록 이름으로 묶는다.
			fields.putIfAbsent(fe.getField().replaceAll("\\[\\d+]$", ""), fe.getDefaultMessage());
		}
		String message = fields.isEmpty() ? ErrorCode.VALIDATION_FAILED.message() : fields.values().iterator().next();
		return handleApi(new ApiException(ErrorCode.VALIDATION_FAILED, message, Map.of("fields", fields)));
	}

	@ExceptionHandler({ HttpMessageNotReadableException.class, MissingServletRequestParameterException.class,
			MethodArgumentTypeMismatchException.class, MissingRequestHeaderException.class })
	ResponseEntity<Map<String, Object>> handleBadRequest(Exception e) {
		return ErrorResponses.of(ErrorCode.VALIDATION_FAILED);
	}

	@ExceptionHandler({ NoResourceFoundException.class, HttpRequestMethodNotSupportedException.class })
	ResponseEntity<Map<String, Object>> handleNotFound(Exception e) {
		return ErrorResponses.of(ErrorCode.NOT_FOUND);
	}

	@ExceptionHandler(Exception.class)
	ResponseEntity<Map<String, Object>> handleUnknown(Exception e) {
		log.error("Unhandled error", e);
		return ErrorResponses.of(ErrorCode.INTERNAL_ERROR);
	}
}
