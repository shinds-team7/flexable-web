package com.flexable.web.applink.http;

import java.net.ConnectException;
import java.net.UnknownHostException;
import java.net.http.HttpClient;
import java.net.http.HttpConnectTimeoutException;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Map;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.http.MediaType;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.stereotype.Component;
import org.springframework.web.client.RestClient;

import com.flexable.web.applink.AppApiClient;
import com.flexable.web.applink.AppApiException;
import com.flexable.web.applink.AppApiException.Kind;
import com.flexable.web.applink.AppLinkProperties;

/**
 * 앱 서버 /internal/v1/web-links/*를 X-Service-Key로 부른다. 요청 처리 중에 부르므로 연결 3초·응답 5초로 끊고 다시 보내지 않는다
 * (다음 조회가 재시도). 오류 응답은 code로 나누고, 연결도 못 한 실패(UNAVAILABLE)와 보낸 뒤 응답을 못 받은 실패를 구분한다.
 * 주소에 linkId가 들어가므로 원인 예외(메시지에 주소가 있음)는 밖으로 내보내지 않는다.
 */
@Component
@ConditionalOnProperty(prefix = "app.applink", name = "mode", havingValue = "http", matchIfMissing = true)
public class RestAppApiClient implements AppApiClient {

	static final String SERVICE_KEY_HEADER = "X-Service-Key";
	private static final long DEFAULT_RETRY_AFTER = 60;

	private final RestClient http;
	private final boolean configured;

	public RestAppApiClient(AppLinkProperties props) {
		this.configured = props.configured();
		HttpClient client = HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(props.connectTimeout())
			.build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(props.readTimeout());
		RestClient.Builder builder = RestClient.builder().requestFactory(factory);
		if (configured) {
			builder.baseUrl(props.baseUrl().replaceAll("/+$", "")).defaultHeader(SERVICE_KEY_HEADER, props.serviceKey());
		}
		this.http = builder.build();
	}

	@Override
	public CreatedLink create(String code) {
		CreateBody body = send(true, http.post().uri("/internal/v1/web-links")
			.contentType(MediaType.APPLICATION_JSON).body(Map.of("code", code)), CreateBody.class);
		// 201을 받았는데 linkId를 읽지 못하면 연동은 생겼을 수 있다.
		if (body == null || body.linkId() == null || body.linkId().isBlank() || body.profile() == null) {
			throw new AppApiException(Kind.RESULT_UNKNOWN);
		}
		return new CreatedLink(body.linkId(), body.profile().toProfile());
	}

	@Override
	public AppProfile profile(String linkId) {
		ProfileBody body = send(false, http.get().uri("/internal/v1/web-links/{linkId}/profile", linkId), ProfileBody.class);
		if (body == null) {
			throw new AppApiException(Kind.UNAVAILABLE);
		}
		return body.toProfile();
	}

	@Override
	public AppSeedMoney seedMoney(String linkId) {
		SeedBody body = send(false, http.get().uri("/internal/v1/web-links/{linkId}/seed-money", linkId), SeedBody.class);
		if (body == null || body.total() == null || body.base() == null || body.monthlyGoal() == null) {
			throw new AppApiException(Kind.UNAVAILABLE);
		}
		LastEntry last = body.lastEntry() == null ? null
				: new LastEntry(body.lastEntry().cycleEnd(), body.lastEntry().choice(),
						body.lastEntry().amount() == null ? 0 : body.lastEntry().amount(), body.lastEntry().createdAt());
		return new AppSeedMoney(body.total(), body.base(), body.monthlyGoal(), last, body.updatedAt());
	}

	@Override
	public void delete(String linkId) {
		send(false, http.delete().uri("/internal/v1/web-links/{linkId}", linkId), Void.class);
	}

	private <T> T send(boolean create, RestClient.RequestHeadersSpec<?> spec, Class<T> type) {
		if (!configured) {
			throw new AppApiException(Kind.NOT_CONFIGURED);
		}
		try {
			return spec.exchange((req, res) -> {
				int status = res.getStatusCode().value();
				if (res.getStatusCode().is2xxSuccessful()) {
					return type == Void.class ? null : res.bodyTo(type);
				}
				ErrorBody error;
				try {
					error = res.bodyTo(ErrorBody.class);
				}
				catch (RuntimeException e) {
					error = null;
				}
				throw failure(create, status, error);
			});
		}
		catch (RuntimeException e) {
			throw classify(create, e);
		}
	}

	static AppApiException failure(boolean create, int status, ErrorBody error) {
		String code = error == null ? null : error.code();
		if (status == 400 && create) {
			// 코드 형식 오류(VALIDATION_FAILED)도 쓸 수 없는 코드로 안내한다. 처리되지 않았으므로 결과는 확실하다.
			return new AppApiException(Kind.CODE_INVALID);
		}
		if (status == 404 && "LINK_NOT_FOUND".equals(code)) {
			return new AppApiException(Kind.LINK_NOT_FOUND);
		}
		if (status == 404 && "BUDGET_NOT_SET".equals(code)) {
			return new AppApiException(Kind.BUDGET_NOT_SET);
		}
		if (status == 429) {
			Long retry = error == null ? null : error.retryAfterSeconds();
			return new AppApiException(Kind.RATE_LIMITED, retry == null || retry < 1 ? DEFAULT_RETRY_AFTER : retry);
		}
		if (status == 401 || status == 403) {
			return new AppApiException(Kind.AUTH_FAILED);
		}
		// 5xx는 앱 서버가 처리했는지 알 수 없다(프록시 시간 초과 등). 그 밖의 404(주소 설정 오류 등)는 연동을 지우지 않는다.
		return new AppApiException(create && status >= 500 ? Kind.RESULT_UNKNOWN : Kind.UNAVAILABLE);
	}

	/** 연결 자체를 못 했으면 요청이 처리되지 않은 것이고, 그 밖(응답 시간 초과·끊김·응답 해석 실패)은 처리됐을 수 있다. */
	static AppApiException classify(boolean create, Throwable e) {
		for (Throwable t = e; t != null; t = t.getCause()) {
			if (t instanceof AppApiException api) {
				return api;
			}
			if (t instanceof ConnectException || t instanceof UnknownHostException || t instanceof HttpConnectTimeoutException) {
				return new AppApiException(Kind.UNAVAILABLE);
			}
		}
		return new AppApiException(create ? Kind.RESULT_UNKNOWN : Kind.UNAVAILABLE);
	}

	record ErrorBody(String code, Long retryAfterSeconds) {
	}

	record ProfileBody(String email, String provider) {

		AppProfile toProfile() {
			if (provider == null || provider.isBlank() || provider.length() > 20) {
				throw new AppApiException(Kind.UNAVAILABLE);
			}
			return new AppProfile(email, provider);
		}
	}

	record CreateBody(String linkId, ProfileBody profile) {

		@Override
		public String toString() {
			return "CreateBody[linkId=***]";
		}
	}

	record LastEntryBody(LocalDate cycleEnd, String choice, Long amount, OffsetDateTime createdAt) {
	}

	record SeedBody(Long total, Long base, Long monthlyGoal, LastEntryBody lastEntry, OffsetDateTime updatedAt) {
	}
}
