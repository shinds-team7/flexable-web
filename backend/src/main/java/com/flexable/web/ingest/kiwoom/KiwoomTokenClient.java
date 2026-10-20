package com.flexable.web.ingest.kiwoom;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDateTime;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.http.MediaType;
import org.springframework.web.client.RestClient;

/** 키움 REST 접근토큰(au10001). 만료 1분 전까지 재사용한다. */
public class KiwoomTokenClient {

	static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
	/** 키움 문서의 Content-Type: application/json;charset=UTF-8 */
	static final MediaType JSON_UTF8 = MediaType.parseMediaType("application/json;charset=UTF-8");
	private static final DateTimeFormatter EXPIRES = DateTimeFormatter.ofPattern("yyyyMMddHHmmss");
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

	private final RestClient http;
	private final String baseUrl;
	private final String appKey;
	private final String secretKey;
	private final Clock clock;
	private String token;
	private Instant expiresAt = Instant.EPOCH;

	public KiwoomTokenClient(RestClient http, String baseUrl, String appKey, String secretKey, Clock clock) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.appKey = appKey;
		this.secretKey = secretKey;
		this.clock = clock;
	}

	public synchronized String token() {
		if (token != null && clock.instant().isBefore(expiresAt.minusSeconds(60))) {
			return token;
		}
		if (appKey == null || appKey.isBlank() || secretKey == null || secretKey.isBlank()) {
			throw new IllegalStateException("KIWOOM_APP_KEY·KIWOOM_SECRET_KEY가 비어 있어요(backend/.env)");
		}
		Map<String, Object> res = http.post()
			.uri(baseUrl + "/oauth2/token")
			.contentType(KiwoomTokenClient.JSON_UTF8)
			.body(Map.of("grant_type", "client_credentials", "appkey", appKey, "secretkey", secretKey))
			.retrieve()
			.body(MAP);
		KiwoomPriceSource.checkReturnCode(res);
		Object t = res.get("token");
		if (!(t instanceof String s) || s.isBlank()) {
			throw new IllegalStateException("키움 토큰 응답에 token이 없어요");
		}
		token = s;
		Object exp = res.get("expires_dt");
		expiresAt = exp instanceof String e && e.length() == 14
				? LocalDateTime.parse(e, EXPIRES).atZone(SEOUL).toInstant()
				: clock.instant().plusSeconds(3600);
		return token;
	}
}
