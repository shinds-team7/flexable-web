package com.flexable.web.applink.http;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.net.InetSocketAddress;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Duration;
import java.util.List;
import java.util.concurrent.CopyOnWriteArrayList;

import org.junit.jupiter.api.AfterEach;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.model.Request;
import com.atlassian.oai.validator.model.SimpleRequest;
import com.atlassian.oai.validator.model.SimpleResponse;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;
import com.flexable.web.applink.AppApiClient.AppSeedMoney;
import com.flexable.web.applink.AppApiException;
import com.flexable.web.applink.AppApiException.Kind;
import com.flexable.web.applink.AppLinkProperties;
import com.sun.net.httpserver.HttpExchange;
import com.sun.net.httpserver.HttpServer;

/**
 * 앱 계약(앱 저장소 docs/contracts/web-link-api.yaml의 사본 docs/contracts/vendor/web-link-api.yaml)과 웹 클라이언트를 대조한다.
 * 앱 스펙에 맞는 응답을 RestAppApiClient가 제대로 읽는지, 웹이 보내는 요청이 앱 스펙에 맞는지 본다. 응답 예시는 스펙으로 먼저 검사하므로
 * 손으로 쓴 값이 스펙과 어긋나면 이 테스트가 실패한다. 사본이 앱 원본과 같은지는 CI(app-contract)가 확인한다.
 */
class AppSpecFixtureTest {

	private static final String KEY = "test-service-key-test-service-key-0000";
	private static final String LINK_ID = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
	private static final OpenApiInteractionValidator SPEC = spec();

	private HttpServer server;
	private RestAppApiClient api;
	private final List<Request> sent = new CopyOnWriteArrayList<>();
	private volatile int status;
	private volatile String body;

	private static OpenApiInteractionValidator spec() {
		try {
			String yaml = Files.readString(Path.of("..", "docs", "contracts", "vendor", "web-link-api.yaml"));
			return OpenApiInteractionValidator.createForInlineApiSpecification(yaml)
				.withLevelResolver(LevelResolver.create()
					.withLevel("validation.schema.additionalProperties", ValidationReport.Level.ERROR)
					// 서비스 키 값은 검사 대상이 아니다
					.withLevel("validation.request.security.missing", ValidationReport.Level.IGNORE)
					.build())
				.build();
		}
		catch (IOException e) {
			throw new IllegalStateException("docs/contracts/vendor/web-link-api.yaml을 읽지 못했어요", e);
		}
	}

	@BeforeEach
	void start() throws IOException {
		server = HttpServer.create(new InetSocketAddress("127.0.0.1", 0), 0);
		server.createContext("/", this::handle);
		server.start();
		api = new RestAppApiClient(new AppLinkProperties("http", "http://127.0.0.1:" + server.getAddress().getPort(), KEY, null,
				Duration.ofSeconds(1), Duration.ofSeconds(2), Duration.ZERO));
	}

	@AfterEach
	void stop() {
		server.stop(0);
	}

	private void handle(HttpExchange ex) throws IOException {
		String reqBody = new String(ex.getRequestBody().readAllBytes(), StandardCharsets.UTF_8);
		// 스펙의 servers가 /internal/v1이라 그 뒤 경로로 검사한다
		SimpleRequest.Builder b = new SimpleRequest.Builder(ex.getRequestMethod(),
				ex.getRequestURI().getPath().replaceFirst("^/internal/v1", ""))
			.withHeader("X-Service-Key", ex.getRequestHeaders().getFirst("X-Service-Key"));
		if (!reqBody.isEmpty()) {
			b.withContentType("application/json").withBody(reqBody);
		}
		sent.add(b.build());
		byte[] out = body == null ? new byte[0] : body.getBytes(StandardCharsets.UTF_8);
		ex.getResponseHeaders().add("Content-Type", "application/json");
		ex.sendResponseHeaders(status, out.length == 0 ? -1 : out.length);
		if (out.length > 0) {
			ex.getResponseBody().write(out);
		}
		ex.close();
	}

	/** 응답 예시가 앱 스펙에 맞는지 먼저 확인하고 그 응답을 돌려주게 한다. */
	private void reply(String method, String path, int status, String body) {
		SimpleResponse.Builder r = SimpleResponse.Builder.status(status);
		if (body != null) {
			r.withContentType("application/json").withBody(body);
		}
		assertThat(errors(SPEC.validateResponse(path, Request.Method.valueOf(method), r.build())))
			.as("%s %s %d 예시가 앱 web-link-api.yaml과 달라요", method, path, status)
			.isEmpty();
		this.status = status;
		this.body = body;
	}

	/** 웹이 보낸 요청이 앱 스펙에 맞는지 */
	private void assertRequestsMatchSpec() {
		assertThat(sent).isNotEmpty();
		for (Request r : sent) {
			assertThat(errors(SPEC.validateRequest(r))).as("%s %s 요청이 앱 web-link-api.yaml과 달라요", r.getMethod(), r.getPath()).isEmpty();
		}
	}

	private static List<String> errors(ValidationReport report) {
		return report.getMessages()
			.stream()
			.filter(m -> m.getLevel() == ValidationReport.Level.ERROR)
			.map(m -> m.getKey() + ": " + m.getMessage())
			.toList();
	}

	private static Kind kindOf(Runnable call) {
		try {
			call.run();
		}
		catch (AppApiException e) {
			return e.kind();
		}
		throw new AssertionError("예외가 나야 합니다");
	}

	@Test
	void createAndProfile() {
		reply("POST", "/web-links", 201, """
				{"linkId":"%s","profile":{"email":null,"provider":"kakao"}}""".formatted(LINK_ID));
		assertThat(api.create("K7M2Q9").profile().provider()).isEqualTo("kakao");

		reply("GET", "/web-links/" + LINK_ID + "/profile", 200, """
				{"email":"a@example.com","provider":"email"}""");
		assertThat(api.profile(LINK_ID).email()).isEqualTo("a@example.com");

		reply("DELETE", "/web-links/" + LINK_ID, 204, null);
		api.delete(LINK_ID);
		assertRequestsMatchSpec();
	}

	@Test
	void seedMoneyWithHistory() {
		reply("GET", "/web-links/" + LINK_ID + "/seed-money", 200, """
				{"total":1450000,"base":500000,"monthlyGoal":300000,
				 "lastEntry":{"cycleEnd":"2026-09-25","choice":"ALL","amount":950000,"createdAt":"2026-09-26T20:10:00+09:00"},
				 "updatedAt":"2026-09-26T20:10:00+09:00","startedOn":"2026-08-26",
				 "entries":[{"cycleEnd":"2026-09-25","choice":"ALL","amount":950000,"totalAfter":1450000,"createdAt":"2026-09-26T20:10:00+09:00"}]}""");
		AppSeedMoney seed = api.seedMoney(LINK_ID);
		assertThat(seed.total()).isEqualTo(1_450_000);
		assertThat(seed.entries()).singleElement().satisfies(e -> assertThat(e.totalAfter()).isEqualTo(1_450_000));

		reply("GET", "/web-links/" + LINK_ID + "/seed-money", 200, """
				{"total":0,"base":0,"monthlyGoal":0,"lastEntry":null,"updatedAt":"2026-10-01T12:00:00+09:00","startedOn":null,"entries":[]}""");
		assertThat(api.seedMoney(LINK_ID).lastEntry()).isNull();
		assertRequestsMatchSpec();
	}

	@Test
	void errorsAreReadByCode() {
		reply("POST", "/web-links", 400, """
				{"code":"LINK_CODE_INVALID","message":"코드를 확인해 주세요"}""");
		assertThat(kindOf(() -> api.create("ZZZZZZ"))).isEqualTo(Kind.CODE_INVALID);

		reply("POST", "/web-links", 429, """
				{"code":"TOO_MANY_ATTEMPTS","message":"잠시 후 다시 시도해 주세요","retryAfterSeconds":120}""");
		try {
			api.create("ZZZZZZ");
			throw new AssertionError("예외가 나야 합니다");
		}
		catch (AppApiException e) {
			assertThat(e.kind()).isEqualTo(Kind.RATE_LIMITED);
			assertThat(e.retryAfterSeconds()).isEqualTo(120);
		}

		reply("GET", "/web-links/" + LINK_ID + "/seed-money", 404, """
				{"code":"BUDGET_NOT_SET","message":"초기 예산을 먼저 설정해 주세요"}""");
		assertThat(kindOf(() -> api.seedMoney(LINK_ID))).isEqualTo(Kind.BUDGET_NOT_SET);

		reply("GET", "/web-links/" + LINK_ID + "/profile", 404, """
				{"code":"LINK_NOT_FOUND","message":"연동을 찾지 못했어요"}""");
		assertThat(kindOf(() -> api.profile(LINK_ID))).isEqualTo(Kind.LINK_NOT_FOUND);

		reply("GET", "/web-links/" + LINK_ID + "/profile", 401, """
				{"code":"UNAUTHORIZED","message":"인증이 필요해요"}""");
		assertThat(kindOf(() -> api.profile(LINK_ID))).isEqualTo(Kind.AUTH_FAILED);
	}
}
