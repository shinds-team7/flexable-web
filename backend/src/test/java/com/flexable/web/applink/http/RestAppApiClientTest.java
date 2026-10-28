package com.flexable.web.applink.http;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.net.ServerSocket;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.flexable.web.applink.AppApiClient.AppSeedMoney;
import com.flexable.web.applink.AppApiClient.CreatedLink;
import com.flexable.web.applink.AppApiException;
import com.flexable.web.applink.AppApiException.Kind;
import com.flexable.web.applink.AppLinkProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/** 실제 HTTP로 앱 서버 응답을 흉내 내 어댑터의 요청 형식과 오류 구분을 본다. */
class RestAppApiClientTest {

	private static final String KEY = "test-service-key-test-service-key-0000";
	private static final String LINK_ID = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";

	private HttpServer server;
	private final List<String> seen = new CopyOnWriteArrayList<>();
	private volatile int status;
	private volatile String body;
	private volatile long delayMillis;

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.start();
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private void handle(HttpExchange ex) throws IOException {
		String reqBody = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
		seen.add(ex.getRequestMethod() + " " + ex.getRequestURI().getPath() + " key=" + ex.getRequestHeaders().getFirst("X-Service-Key")
				+ " " + reqBody);
		try {
			Thread.sleep(delayMillis);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
		}
		byte[] out = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().add("Content-Type", "application/json");
		ex.sendResponseHeaders(status, out.length == 0 ? -1 : out.length);
		if (out.length > 0) {
			ex.getResponseBody().write(out);
		}
		ex.close();
	}

	private RestAppApiClient client(String baseUrl) {
		return new RestAppApiClient(new AppLinkProperties("http", baseUrl, KEY, null, Duration.ofSeconds(1),
				Duration.ofMillis(500), Duration.ZERO));
	}

	/**
	 * 테스트마다 하나를 만들어 필드로 잡아 둔다. 호출마다 새로 만들면 응답 본문을 읽는 중에 JDK HttpClient가 GC되어
	 * 본문 스트림이 닫힐 수 있다(운영에서는 빈 하나가 계속 잡고 있어 생기지 않음).
	 */
	private RestAppApiClient api;

	private RestAppApiClient client() {
		if (api == null) {
			api = client("http://127.0.0.1:" + server.getAddress().getPort() + "/");
		}
		return api;
	}

	private void reply(int status, String body) {
		this.status = status;
		this.body = body;
	}

	private static Kind kindOf(Runnable call) {
		try {
			call.run();
		}
		catch (AppApiException e) {
			assertThat(e.getMessage()).doesNotContain(LINK_ID);
			assertThat(e.getCause()).isNull();
			return e.kind();
		}
		throw new AssertionError("예외가 나야 합니다");
	}

	@Test
	void createSendsCodeWithServiceKey() {
		reply(201, """
				{"linkId":"%s","profile":{"email":null,"provider":"google"}}""".formatted(LINK_ID));
		assertThat(client().enabled()).isTrue();
		CreatedLink created = client().create("k7m2-q9xb");
		assertThat(created.linkId()).isEqualTo(LINK_ID);
		assertThat(created.profile().email()).isNull();
		assertThat(created.profile().provider()).isEqualTo("google");
		assertThat(created.toString()).doesNotContain(LINK_ID);
		assertThat(seen).singleElement().asString()
			.startsWith("POST /internal/v1/web-links key=" + KEY)
			.contains("\"code\":\"k7m2-q9xb\"");
	}

	@Test
	void readsProfileAndSeedMoney() {
		reply(200, """
				{"total":1450000,"base":500000,"monthlyGoal":300000,
				 "lastEntry":{"cycleEnd":"2026-10-25","choice":"MANUAL","amount":200000,"createdAt":"2026-10-24T20:00:00+09:00"},
				 "updatedAt":"2026-10-24T20:00:00+09:00"}""");
		AppSeedMoney seed = client().seedMoney(LINK_ID);
		assertThat(seed.total()).isEqualTo(1_450_000);
		assertThat(seed.lastEntry().choice()).isEqualTo("MANUAL");
		assertThat(seed.lastEntry().amount()).isEqualTo(200_000);
		assertThat(seen.get(0)).startsWith("GET /internal/v1/web-links/" + LINK_ID + "/seed-money key=" + KEY);

		reply(200, """
				{"total":0,"base":0,"monthlyGoal":0,"lastEntry":null,"updatedAt":"2026-10-24T20:00:00+09:00"}""");
		assertThat(client().seedMoney(LINK_ID).lastEntry()).isNull();

		reply(200, "{\"email\":\"a@example.com\",\"provider\":\"email\"}");
		assertThat(client().profile(LINK_ID).email()).isEqualTo("a@example.com");

		reply(204, null);
		client().delete(LINK_ID);
		assertThat(seen.get(seen.size() - 1)).startsWith("DELETE /internal/v1/web-links/" + LINK_ID + " key=");
	}

	/** 앱 web-link-api.yaml PUT seed-money: 총액을 보내고 반영 뒤 값을 받는다. 400은 앱의 안내 문구와 함께 REJECTED. */
	@Test
	void updatesSeedMoneyAndCarriesRejection() {
		reply(200, """
				{"total":1200000,"base":900000,"monthlyGoal":300000,"lastEntry":null,
				 "updatedAt":"2026-10-27T12:00:00+09:00","startedOn":null,"entries":[]}""");
		AppSeedMoney seed = client().updateSeedMoney(LINK_ID, 1_200_000);
		assertThat(seed.total()).isEqualTo(1_200_000);
		assertThat(seed.base()).isEqualTo(900_000);
		assertThat(seen).singleElement().asString()
			.startsWith("PUT /internal/v1/web-links/" + LINK_ID + "/seed-money key=" + KEY)
			.contains("\"total\":1200000");

		reply(400, """
				{"code":"VALIDATION_FAILED","message":"입력한 내용을 확인해 주세요","fields":{"total":"앱에서 반영한 돈(300,000원)보다 작게 고칠 수 없어요"}}""");
		try {
			client().updateSeedMoney(LINK_ID, 1);
			throw new AssertionError("예외가 나야 합니다");
		}
		catch (AppApiException e) {
			assertThat(e.kind()).isEqualTo(Kind.REJECTED);
			assertThat(e.detail()).isEqualTo("앱에서 반영한 돈(300,000원)보다 작게 고칠 수 없어요");
		}
		reply(404, "{\"code\":\"BUDGET_NOT_SET\",\"message\":\"x\"}");
		assertThat(kindOf(() -> client().updateSeedMoney(LINK_ID, 1))).isEqualTo(Kind.BUDGET_NOT_SET);
	}

	/** 앱 docs/API.md 예시: 시작일과 주기별 반영 기록(오름차순, 0원 반영 포함)을 그대로 읽는다. */
	@Test
	void readsStartDateAndEntries() {
		reply(200, """
				{"total":1450000,"base":500000,"monthlyGoal":300000,
				 "lastEntry":{"cycleEnd":"2026-11-25","choice":"MANUAL","amount":0,"createdAt":"2026-11-25T20:10:00+09:00"},
				 "updatedAt":"2026-11-25T20:10:00+09:00","startedOn":"2026-08-26",
				 "entries":[{"cycleEnd":"2026-09-25","choice":"ALL","amount":950000,"totalAfter":1450000,"createdAt":"2026-09-26T20:10:00+09:00"},
				            {"cycleEnd":"2026-11-25","choice":"MANUAL","amount":0,"totalAfter":1450000,"createdAt":"2026-11-25T20:10:00+09:00"}]}""");
		AppSeedMoney seed = client().seedMoney(LINK_ID);
		assertThat(seed.total()).isEqualTo(1_450_000);
		assertThat(seed.lastEntry().choice()).isEqualTo("MANUAL");
		assertThat(seed.lastEntry().amount()).isZero();
		assertThat(seed.startedOn()).hasToString("2026-08-26");
		assertThat(seed.entries()).hasSize(2);
		assertThat(seed.entries().get(0).totalAfter()).isEqualTo(1_450_000);
		assertThat(seed.entries().get(1).amount()).isZero();

		// 앱 서버가 추가 필드를 배포하기 전 응답은 시작일 없음·기록 없음
		reply(200, """
				{"total":0,"base":0,"monthlyGoal":0,"lastEntry":null,"updatedAt":"2026-10-24T20:00:00+09:00"}""");
		seed = client().seedMoney(LINK_ID);
		assertThat(seed.startedOn()).isNull();
		assertThat(seed.entries()).isEmpty();

		// 필수 값이 빠진 기록은 응답 전체를 믿지 않는다
		reply(200, """
				{"total":0,"base":0,"monthlyGoal":0,"lastEntry":null,"updatedAt":"2026-10-24T20:00:00+09:00",
				 "entries":[{"cycleEnd":"2026-09-25","choice":"ALL","amount":1}]}""");
		assertThat(kindOf(() -> client().seedMoney(LINK_ID))).isEqualTo(Kind.UNAVAILABLE);
	}

	@Test
	void errorCodesAreSeparated() {
		RestAppApiClient c = client();
		reply(400, "{\"code\":\"LINK_CODE_INVALID\",\"message\":\"...\"}");
		assertThat(kindOf(() -> c.create("x"))).isEqualTo(Kind.CODE_INVALID);
		reply(404, "{\"code\":\"LINK_NOT_FOUND\"}");
		assertThat(kindOf(() -> c.profile(LINK_ID))).isEqualTo(Kind.LINK_NOT_FOUND);
		assertThat(kindOf(() -> c.delete(LINK_ID))).isEqualTo(Kind.LINK_NOT_FOUND);
		reply(404, "{\"code\":\"BUDGET_NOT_SET\"}");
		assertThat(kindOf(() -> c.seedMoney(LINK_ID))).isEqualTo(Kind.BUDGET_NOT_SET);
		// 주소를 잘못 넣어 받은 다른 404는 연동 해제로 보지 않는다.
		reply(404, "{\"code\":\"NOT_FOUND\"}");
		assertThat(kindOf(() -> c.profile(LINK_ID))).isEqualTo(Kind.UNAVAILABLE);
		reply(404, "<html>not found</html>");
		assertThat(kindOf(() -> c.profile(LINK_ID))).isEqualTo(Kind.UNAVAILABLE);
		reply(401, "{\"code\":\"UNAUTHORIZED\"}");
		assertThat(kindOf(() -> c.profile(LINK_ID))).isEqualTo(Kind.AUTH_FAILED);
		reply(500, "{\"code\":\"INTERNAL_ERROR\"}");
		assertThat(kindOf(() -> c.profile(LINK_ID))).isEqualTo(Kind.UNAVAILABLE);
		// 생성 요청의 5xx는 앱 서버가 처리했는지 알 수 없다.
		assertThat(kindOf(() -> c.create("x"))).isEqualTo(Kind.RESULT_UNKNOWN);
	}

	@Test
	void rateLimitCarriesRetryAfter() {
		reply(429, "{\"code\":\"TOO_MANY_ATTEMPTS\",\"retryAfterSeconds\":321}");
		AppApiException e = (AppApiException) catchThrown(() -> client().create("x"));
		assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED);
		assertThat(e.retryAfterSeconds()).isEqualTo(321);
		reply(429, "");
		assertThat(((AppApiException) catchThrown(() -> client().create("x"))).retryAfterSeconds()).isEqualTo(60);
	}

	@Test
	void responseTimeoutAfterSendingCreateIsUnknown() {
		delayMillis = 1500;
		reply(201, "{\"linkId\":\"%s\",\"profile\":{\"email\":null,\"provider\":\"email\"}}".formatted(LINK_ID));
		assertThat(kindOf(() -> client().create("x"))).isEqualTo(Kind.RESULT_UNKNOWN);
		assertThat(kindOf(() -> client().profile(LINK_ID))).isEqualTo(Kind.UNAVAILABLE);
		// 다시 보내지 않는다.
		assertThat(seen.stream().filter(s -> s.startsWith("POST"))).hasSize(1);
	}

	@Test
	void unreadableSuccessOnCreateIsUnknown() {
		reply(201, "{\"profile\":{\"provider\":\"email\"}}");
		assertThat(kindOf(() -> client().create("x"))).isEqualTo(Kind.RESULT_UNKNOWN);
		reply(201, "not json");
		assertThat(kindOf(() -> client().create("x"))).isEqualTo(Kind.RESULT_UNKNOWN);
	}

	@Test
	void connectionRefusedMeansNotSent() throws IOException {
		int port;
		try (ServerSocket s = new ServerSocket(0)) {
			port = s.getLocalPort();
		}
		RestAppApiClient c = client("http://127.0.0.1:" + port);
		assertThat(kindOf(() -> c.create("x"))).isEqualTo(Kind.UNAVAILABLE);
		assertThat(kindOf(() -> c.profile(LINK_ID))).isEqualTo(Kind.UNAVAILABLE);
	}

	@Test
	void missingConfigurationNeverCallsOut() {
		RestAppApiClient c = new RestAppApiClient(new AppLinkProperties("http", "", "", null, Duration.ofSeconds(1),
				Duration.ofSeconds(1), Duration.ZERO));
		assertThat(c.enabled()).isFalse();
		assertThat(kindOf(() -> c.create("x"))).isEqualTo(Kind.NOT_CONFIGURED);
		assertThat(seen).isEmpty();
	}

	private static Throwable catchThrown(Runnable r) {
		try {
			r.run();
		}
		catch (Throwable t) {
			return t;
		}
		throw new AssertionError("예외가 나야 합니다");
	}
}
