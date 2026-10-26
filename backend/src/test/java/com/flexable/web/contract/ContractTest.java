package com.flexable.web.contract;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.model.Request;
import com.atlassian.oai.validator.model.SimpleResponse;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;
import com.flexable.web.ai.GoalCoachClient;
import com.flexable.web.ai.GoalCoachClient.Content;
import com.flexable.web.ai.GoalCoachClient.Content.Step;
import com.flexable.web.applink.AppApiClient;
import com.flexable.web.applink.AppApiClient.AppProfile;
import com.flexable.web.applink.AppApiClient.AppSeedMoney;
import com.flexable.web.applink.AppApiClient.CreatedLink;
import com.flexable.web.applink.AppApiClient.Entry;
import com.flexable.web.applink.AppApiClient.LastEntry;
import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketService;
import com.jayway.jsonpath.JsonPath;

import tools.jackson.databind.json.JsonMapper;

/**
 * 계약 테스트: 실제 응답(상태 코드·본문)을 docs/contracts/web-api.yaml로 검사한다. 스펙에 없는 상태 코드나 필드가 나오면 실패한다.
 * 엔드포인트마다 정상·오류 응답을 한 번 이상 부른다. 외부(앱 서버·OpenAI)는 바꿔 끼우고, 시세·사건은 DB에 미리 넣는다.
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:contract;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class ContractTest {

	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final OpenApiInteractionValidator VALIDATOR = validator();
	private static final String PASSWORD = "password1";

	@Autowired
	MockMvc mvc;
	@Autowired
	MarketService market;
	@Autowired
	EventService events;
	@MockitoBean
	AppApiClient app;
	@MockitoBean
	GoalCoachClient ai;

	private static boolean seeded;
	private static long eventId;

	private static OpenApiInteractionValidator validator() {
		try {
			String spec = Files.readString(Path.of("..", "docs", "contracts", "web-api.yaml"));
			return OpenApiInteractionValidator.createForInlineApiSpecification(spec)
				.withLevelResolver(LevelResolver.create()
					// 스펙에 적지 않은 필드가 응답에 있으면 실패
					.withLevel("validation.schema.additionalProperties", ValidationReport.Level.ERROR)
					.build())
				.build();
		}
		catch (Exception e) {
			throw new IllegalStateException("docs/contracts/web-api.yaml을 읽지 못했어요", e);
		}
	}

	@BeforeEach
	void setup() {
		reset(app, ai);
		when(app.enabled()).thenReturn(true);
		when(ai.enabled()).thenReturn(false);
		if (seeded) {
			return;
		}
		seeded = true;
		LocalDate today = LocalDate.now();
		market.replaceBoard(Board.KOSPI, List.of(new InstrumentRow("005930", "삼성전자", "KOSPI", "STOCK", 900L)), "테스트 목록", null, today);
		// 360750은 시세를 모으지 않은 종목(503)으로 둔다
		market.replaceBoard(Board.ETF, List.of(new InstrumentRow("069500", "KODEX 200", null, "ETF", 120L),
				new InstrumentRow("360750", "TIGER 미국S&P500", null, "ETF", 90L)), "테스트 목록", null, today);
		List<LocalDate> dates = new ArrayList<>();
		for (LocalDate d = today.minusYears(3); !d.isAfter(today); d = d.plusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				dates.add(d);
			}
		}
		int jump = dates.size() - 60;
		Random rnd = new Random(3);
		List<DailyClose> proxy = new ArrayList<>();
		List<DailyClose> stock = new ArrayList<>();
		double m = Math.log(30_000), s = Math.log(60_000);
		for (int i = 0; i < dates.size(); i++) {
			if (i > 0) {
				double mr = rnd.nextGaussian() * 0.008;
				m += mr;
				s += mr + rnd.nextGaussian() * 0.004 + (i == jump ? Math.log(1.2) : 0);
			}
			proxy.add(new DailyClose(dates.get(i), Math.round(Math.exp(m))));
			stock.add(new DailyClose(dates.get(i), Math.round(Math.exp(s))));
		}
		market.saveDailyCloses("069500", proxy, Map.of(), "테스트");
		market.saveDailyCloses("005930", stock, Map.of(), "테스트");
		events.detect("069500");
		events.detect("005930");
		LocalDate jumpDate = dates.get(jump);
		eventId = events.events("005930").stream().filter(e -> e.startDate().equals(jumpDate)).findFirst().orElseThrow().id();
		events.saveEvidence(eventId, "DART", List.of(new EvidenceRow("DART", "20990101000001", "단일판매ㆍ공급계약체결", "삼성전자",
				jumpDate, "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20990101000001", 3)));
	}

	/** 요청을 보내고 상태 코드를 확인한 뒤 응답을 스펙으로 검사한다. */
	private MvcResult call(MockHttpServletRequestBuilder req, int expectedStatus) throws Exception {
		MvcResult r = mvc.perform(req).andReturn();
		var res = r.getResponse();
		String body = res.getContentAsString(StandardCharsets.UTF_8);
		String what = r.getRequest().getMethod() + " " + r.getRequest().getRequestURI();
		assertThat(res.getStatus()).as("%s → %s", what, body).isEqualTo(expectedStatus);
		SimpleResponse.Builder b = SimpleResponse.Builder.status(res.getStatus());
		if (res.getContentType() != null) {
			b.withContentType(res.getContentType());
		}
		if (!body.isEmpty()) {
			b.withBody(body);
		}
		ValidationReport report = VALIDATOR.validateResponse(r.getRequest().getRequestURI(),
				Request.Method.valueOf(r.getRequest().getMethod()), b.build());
		List<String> errors = report.getMessages().stream()
			.filter(msg -> msg.getLevel() == ValidationReport.Level.ERROR)
			.map(msg -> msg.getKey() + ": " + msg.getMessage())
			.toList();
		assertThat(errors).as("%s 응답이 docs/contracts/web-api.yaml과 달라요. 본문: %s", what, body).isEmpty();
		return r;
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder req, String body) {
		return req.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder req, String token) {
		return req.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
	}

	private static String signupBody(String email) {
		return "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\",\"agreeTerms\":true}";
	}

	private static String newEmail() {
		return "c" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
	}

	private String signup() throws Exception {
		MvcResult r = call(json(post("/api/v1/auth/signup"), signupBody(newEmail())), 201);
		return JsonPath.read(r.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");
	}

	private static String goalBody(long amount, String due) {
		return "{\"category\":\"TRAVEL\",\"name\":\"여행\",\"amount\":" + amount + ",\"dueMonth\":\"" + due
				+ "\",\"currentAmount\":470000,\"monthlyPace\":78000}";
	}

	@Test
	void 공개_엔드포인트() throws Exception {
		call(get("/api/v1/health"), 200);
		call(get("/api/v1/auth/oauth/providers"), 200);
		call(json(post("/api/v1/auth/oauth/exchange"), "{\"code\":\"nope\",\"codeVerifier\":\"nope\"}"), 401);
		call(get("/api/v1/market/instruments?board=KOSPI"), 200);
		call(get("/api/v1/market/instruments?board=NOPE"), 400);
		call(get("/api/v1/market/status"), 200);
		call(get("/api/v1/market/events/" + eventId), 200);
		call(get("/api/v1/market/events/999999999"), 404);
	}

	@Test
	void 투자_시뮬레이션() throws Exception {
		String start = LocalDate.now().minusYears(1).withDayOfMonth(1).toString();
		String head = "{\"startDate\":\"" + start + "\",\"funding\":";
		call(json(post("/api/v1/simulations/run"),
				head + "{\"mode\":\"LUMP_SUM\",\"totalAmount\":1000000},\"legs\":[{\"instrumentId\":\"005930\"}]}"), 200);
		call(json(post("/api/v1/simulations/run"), head + "{\"mode\":\"SPLIT\",\"monthlyAmount\":78000},"
				+ "\"legs\":[{\"instrumentId\":\"005930\",\"weight\":0.5},{\"instrumentId\":\"069500\",\"weight\":0.5}]}"), 200);
		call(json(post("/api/v1/simulations/run"), head + "{\"mode\":\"LUMP_SUM\",\"totalAmount\":1000000},\"legs\":[]}"), 400);
		call(json(post("/api/v1/simulations/run"),
				head + "{\"mode\":\"LUMP_SUM\",\"totalAmount\":1000000},\"legs\":[{\"instrumentId\":\"360750\"}]}"), 503);
	}

	@Test
	void 계정과_설정() throws Exception {
		String email = newEmail();
		call(json(post("/api/v1/auth/signup"), signupBody(email)), 201);
		call(json(post("/api/v1/auth/signup"), signupBody(email)), 409);
		call(json(post("/api/v1/auth/signup"), "{\"email\":\"bad\",\"password\":\"short\",\"agreeTerms\":false}"), 400);
		call(json(post("/api/v1/auth/login"), "{\"email\":\"" + email + "\",\"password\":\"wrong1234\"}"), 401);
		MvcResult login = call(json(post("/api/v1/auth/login"), "{\"email\":\"" + email + "\",\"password\":\"" + PASSWORD + "\"}"), 200);
		String token = JsonPath.read(login.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.accessToken");

		call(get("/api/v1/me"), 401);
		call(auth(get("/api/v1/me"), token), 200);
		call(auth(get("/api/v1/me/settings"), token), 200);
		call(auth(json(patch("/api/v1/me/settings"), "{\"theme\":\"dark\",\"seenTours\":[\"invest\"],\"disclaimerAck\":true}"), token), 200);
		call(auth(json(patch("/api/v1/me/settings"), "{\"theme\":\"blue\"}"), token), 400);
		call(auth(post("/api/v1/auth/logout"), token), 204);

		String other = signup();
		call(auth(json(delete("/api/v1/me"), "{\"password\":\"wrong1234\"}"), other), 401);
		call(auth(json(delete("/api/v1/me"), "{}"), other), 400);
		call(auth(json(delete("/api/v1/me"), "{\"password\":\"" + PASSWORD + "\"}"), other), 204);
	}

	@Test
	void 시드머니와_앱_연동() throws Exception {
		String token = signup();
		OffsetDateTime at = OffsetDateTime.parse("2026-09-25T20:10:00+09:00");
		when(app.create(anyString())).thenReturn(new CreatedLink("link-" + UUID.randomUUID(), new AppProfile(null, "kakao")));
		when(app.profile(anyString())).thenReturn(new AppProfile("app@example.com", "email"));
		when(app.seedMoney(anyString())).thenReturn(new AppSeedMoney(4_700_000, 4_000_000, 300_000,
				new LastEntry(LocalDate.of(2026, 9, 24), "GOAL", 300_000, at), at, LocalDate.of(2026, 7, 1),
				List.of(new Entry(LocalDate.of(2026, 8, 24), "ALL", 400_000, 4_400_000, at),
						new Entry(LocalDate.of(2026, 9, 24), "GOAL", 300_000, 4_700_000, at))));

		call(auth(get("/api/v1/me/seed-money"), token), 200);
		call(auth(get("/api/v1/app-link"), token), 200);
		call(auth(json(post("/api/v1/app-link"), "{\"code\":\"K7M2Q9\"}"), token), 201);
		call(auth(json(post("/api/v1/app-link"), "{\"code\":\"K7M2Q9\"}"), token), 409);
		call(auth(get("/api/v1/app-link"), token), 200);
		call(auth(post("/api/v1/app-link/refresh"), token), 200);
		call(auth(get("/api/v1/me/seed-money"), token), 200);
		call(auth(json(put("/api/v1/me/seed-money/manual"), "{\"total\":5000000}"), token), 200);
		call(auth(json(put("/api/v1/me/seed-money/manual"), "{\"total\":1000000001}"), token), 400);
		call(auth(delete("/api/v1/me/seed-money/manual"), token), 204);
		call(auth(delete("/api/v1/app-link"), token), 204);
		call(auth(json(post("/api/v1/app-link"), "{\"code\":\"!!\"}"), token), 400);
	}

	@Test
	void 목표와_AI_안내() throws Exception {
		String token = signup();
		String due = YearMonth.now().plusMonths(12).toString();
		call(auth(get("/api/v1/me/goal"), token), 200);
		call(auth(post("/api/v1/me/goal/coach"), token), 404);
		call(auth(json(put("/api/v1/me/goal"), goalBody(1_000_000, due)), token), 200);
		call(auth(json(put("/api/v1/me/goal"), "{\"category\":\"NOPE\",\"name\":\"\",\"amount\":1,\"dueMonth\":\"2000-01\"}"), token), 400);
		// 키 없음 → 기본 안내(AI_UNAVAILABLE)
		call(auth(post("/api/v1/me/goal/coach"), token), 200);
		// AI 실패 → 기본 안내(AI_FAILED)
		when(ai.enabled()).thenReturn(true);
		when(ai.generate(anyString(), anyList())).thenThrow(new GoalCoachClient.Failed());
		call(auth(json(put("/api/v1/me/goal"), goalBody(1_200_000, due)), token), 200);
		call(auth(post("/api/v1/me/goal/coach"), token), 200);
		// AI 성공
		reset(ai);
		when(ai.enabled()).thenReturn(true);
		String content = JSON.writeValueAsString(new Content("매달 {requiredMonthly}이 필요해요", "만들기 전에 한 번 점검해요",
				List.of(new Step("점검해요", "남긴 돈을 반영해요"), new Step("살펴봐요", "예산을 살펴봐요"), new Step("확인해요", "기한을 확인해요"))));
		when(ai.generate(anyString(), anyList())).thenReturn(new GoalCoachClient.Result(content, "fake-model", 100, 50));
		call(auth(json(put("/api/v1/me/goal"), goalBody(1_500_000, due)), token), 200);
		call(auth(post("/api/v1/me/goal/coach"), token), 200);
		call(auth(get("/api/v1/me/goal"), token), 200);
		// 실패·성공으로 2회를 썼다. 한 번 더 쓰고, 무료 하루 3회를 넘기면 429
		call(auth(json(put("/api/v1/me/goal"), goalBody(1_600_000, due)), token), 200);
		call(auth(post("/api/v1/me/goal/coach"), token), 200);
		call(auth(json(put("/api/v1/me/goal"), goalBody(1_700_000, due)), token), 200);
		call(auth(post("/api/v1/me/goal/coach"), token), 429);
		call(auth(delete("/api/v1/me/goal"), token), 204);
	}
}
