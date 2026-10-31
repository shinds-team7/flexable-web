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

import java.math.BigDecimal;
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
import org.springframework.jdbc.core.JdbcTemplate;
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
import com.flexable.web.ingest.fake.FakePracticeData;
import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventService;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;
import com.flexable.web.market.MarketInsightService;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketService;
import com.flexable.web.market.PracticeMarketService;
import com.flexable.web.news.NewsCategory;
import com.flexable.web.news.NewsDtos.PolicyDraft;
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;
import com.flexable.web.news.NewsService;
import com.flexable.web.deposit.DepositCatalogService;
import com.flexable.web.savings.SavingsCatalogService;
import com.flexable.web.savings.SavingsCatalogService.OptionData;
import com.flexable.web.savings.SavingsCatalogService.PolicyData;
import com.flexable.web.savings.SavingsCatalogService.ProductData;
import com.jayway.jsonpath.JsonPath;

import io.swagger.v3.core.util.Json;
import io.swagger.v3.oas.models.OpenAPI;
import io.swagger.v3.parser.OpenAPIV3Parser;
import io.swagger.v3.parser.core.models.ParseOptions;

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
	@Autowired
	MarketInsightService insight;
	@Autowired
	NewsService news;
	@Autowired
	PracticeMarketService practice;
	@Autowired
	SavingsCatalogService savings;

	@Autowired
	DepositCatalogService deposits;
	@Autowired
	JdbcTemplate jdbc;
	@MockitoBean
	AppApiClient app;
	@MockitoBean
	GoalCoachClient ai;

	private static boolean seeded;
	private static long eventId;
	/** 시장 띠 칸의 전날(코스닥은 이날 값이 없어 응답에서 빠진다). */
	private static LocalDate stripPrevDay;

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
		// AI 개요(worker가 미리 저장, decisions/2026-10-29-event-ai-summary)
		events.applyOverviews(List.of(new OverviewResult(eventId, "test-hash", "삼성전자 주가는 하루에 크게 올랐어요. 이 기간에 단일판매ㆍ공급계약체결 공시가 있었어요.",
				"test-model", false)));
		// 투자 인사이트: 업종(삼성전자만), 시장 띠는 코스피 두 날(보임)·코스닥 하루(전일 값이 없어 빠짐)
		market.setIndustries(Map.of("005930", "전기전자"), today);
		insight.saveIndex(IndexKey.KOSPI, List.of(new IndexValue(dates.get(dates.size() - 2), new java.math.BigDecimal("2600.10")),
				new IndexValue(dates.getLast(), new java.math.BigDecimal("2587.55"))), "키움증권");
		insight.saveIndex(IndexKey.KOSDAQ, List.of(new IndexValue(dates.getLast(), new java.math.BigDecimal("850.00"))), "키움증권");
		stripPrevDay = dates.get(dates.size() - 2);
		// 키움 밖 칸은 두 날씩(새 key·unit이 스펙에 맞는지 본다). 금은 원/g 정수, 환율은 소수 2자리
		Map<IndexKey, String[]> others = Map.of(IndexKey.KRXBOND, new String[] { "191.20", "191.35" }, IndexKey.GOLD, new String[] { "151200", "150800" },
				IndexKey.USDKRW, new String[] { "1385.50", "1390.10" }, IndexKey.JPYKRW, new String[] { "905.12", "903.40" },
				IndexKey.EURKRW, new String[] { "1501.30", "1498.75" }, IndexKey.CNYKRW, new String[] { "190.21", "190.55" });
		others.forEach((key, v) -> insight.saveIndex(key, List.of(new IndexValue(dates.get(dates.size() - 2), new java.math.BigDecimal(v[0])),
				new IndexValue(dates.getLast(), new java.math.BigDecimal(v[1]))), key == IndexKey.KRXBOND || key == IndexKey.GOLD ? "한국거래소" : "한국수출입은행"));
		// 청년 소식(검수 없이 게시): 요약·계산 연결이 있는 전국 카드, 요약 없이 빈 값이 많은 지역 카드, 반려해서 빠지는 카드
		news.saveCollected(new PolicyDraft("FAKE", "c-all", "{}", "전국 청년 저축 지원", List.of(NewsCategory.FINANCE, NewsCategory.CULTURE), 19, 34,
				Boolean.TRUE, true, null, today.minusDays(1), today.plusDays(30), false, "○○부(예시)", "https://example.com/c-all", today,
				today.minusDays(3), List.of("저축"), null));
		news.saveCollected(new PolicyDraft("FAKE", "c-seoul", "{}", "서울 청년 월세 지원", List.of(NewsCategory.HOUSING), null, null, null,
				false, List.of("서울"), null, null, true, "서울특별시(예시)", "https://example.com/c-seoul", today, null, List.of(), null));
		news.saveCollected(new PolicyDraft("FAKE", "c-rejected", "{}", "반려한 소식", List.of(NewsCategory.TAX), null, null, null,
				true, null, null, null, true, "○○청(예시)", "https://example.com/c-rejected", today, null, List.of(), null));
		jdbc.update("UPDATE youth_news SET review_status = 'REJECTED' WHERE external_id = 'c-rejected'");
		jdbc.update("UPDATE youth_news SET calc_target = 'POLICY_SAVINGS', slot = 'MAIN' WHERE external_id = 'c-all'");
		SummaryTarget all = news.summaryTargets(10).stream().filter(t -> t.title().equals("전국 청년 저축 지원")).findFirst().orElseThrow();
		news.applySummaries(List.of(new SummaryResult(all.id(), all.contentHash(), "청년이 매달 저축하면 정부가 돈을 더 얹어 줘요.")));
		// 적금: 한도·우대가 있는 단리 상품, 한도 없는 복리 상품, 기본금리가 없어 목록에서 빠지는 상품. 정책은 빈 항목이 많은 것과 채운 것
		savings.replaceAll(List.of(
				new ProductData("0010001", "A", "BANK", "202610", "예시은행", "예시 적금", "영업점", "만기 후 이율", "우대 원문", "1", "실명의 개인",
						"해당없음", 300_000L, "20261001", null, "202610011000",
						List.of(new OptionData("S", "S", 12, new BigDecimal("3.50"), new BigDecimal("4.00")))),
				new ProductData("0010002", "B", "SAVINGS_BANK", "202610", "예시저축은행", "복리 적금", "인터넷", null, null, null, null, null, null,
						"20261001", null, "202610011000", List.of(new OptionData("M", "S", 12, new BigDecimal("3.80"), null))),
				new ProductData("0010001", "C", "BANK", "202610", "예시은행", "금리 없는 적금", "영업점", null, null, "1", null, null, null,
						"20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, null, new BigDecimal("2.00"))))));
		// 정기예금: 한도가 있는 단리 상품, 한도 없는 복리 상품, 기본금리가 없어 목록에서 빠지는 상품
		deposits.replaceAll(List.of(
				new DepositCatalogService.ProductData("0010001", "A", "BANK", "202610", "예시은행", "예시 정기예금", "영업점", "만기 후 이율", "우대 원문",
						"1", "실명의 개인", "해당없음", 20_000_000L, "20261001", null, "202610011000",
						List.of(new DepositCatalogService.OptionData("S", 12, new BigDecimal("3.50"), new BigDecimal("3.90")))),
				new DepositCatalogService.ProductData("0010002", "B", "SAVINGS_BANK", "202610", "예시저축은행", "복리 정기예금", "인터넷", null, null, null, null,
						null, null, "20261001", null, "202610011000",
						List.of(new DepositCatalogService.OptionData("M", 12, new BigDecimal("3.80"), null))),
				new DepositCatalogService.ProductData("0010001", "C", "BANK", "202610", "예시은행", "금리 없는 정기예금", "영업점", null, null, "1", null, null,
						null, "20261001", null, "202610011000", List.of(new DepositCatalogService.OptionData("S", 12, null, new BigDecimal("2.00"))))));
		savings.replacePolicies(List.of(
				new PolicyData("P1", "청년 저축 지원(예시)", "설명", "지원 내용", "금융", "취약계층 및 금융지원", "○○부", "운영기관", "20261007 ~ 20261016", null,
						null, null, "온라인 신청", null, null, "https://example.com", null, null, 19, 34, null, null, null, "2026-10-20 00:00:00", "전국"),
				new PolicyData("P2", "빈 항목 정책(예시)", null, null, null, null, null, null, null, null, null, null, null, null, null, null, null,
						null, 0, 0, null, null, null, "2026-10-20 00:00:00", null)));
		// 사건 퀴즈 시뮬레이션: 가상 기업 예시 자료(테스트는 price-source=fake라 예시만 후보)
		FakePracticeData.create(today).forEach(practice::save);
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
		MvcResult detail = call(get("/api/v1/market/events/" + eventId), 200);
		String detailBody = detail.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat((String) JsonPath.read(detailBody, "$.aiSummary.model")).isEqualTo("test-model");
		assertThat((Boolean) JsonPath.read(detailBody, "$.aiGenerated")).isFalse();
		call(get("/api/v1/market/events/999999999"), 404);
		// 사건 무렵 뉴스: 테스트는 예시 소스(fake). 기간 밖 예시 기사는 빠지고 저장하지 않으므로 no-store
		MvcResult news = call(get("/api/v1/market/events/" + eventId + "/news"), 200);
		String newsBody = news.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat((List<?>) JsonPath.read(newsBody, "$.items")).hasSize(2);
		assertThat((Boolean) JsonPath.read(newsBody, "$.isSample")).isTrue();
		assertThat(news.getResponse().getHeader(HttpHeaders.CACHE_CONTROL)).contains("no-store");
		call(get("/api/v1/market/events/999999999/news"), 404);
		for (String period : List.of("3M", "6M", "1Y", "3Y")) {
			call(get("/api/v1/market/instruments/005930/prices?period=" + period), 200);
		}
		call(get("/api/v1/market/instruments/005930/prices"), 200);
		call(get("/api/v1/market/instruments/005930/prices?period=5Y"), 400);
		call(get("/api/v1/market/instruments/999999/prices"), 404);
		call(get("/api/v1/market/instruments/360750/prices"), 404); // 시세를 모으지 않은 종목
		MvcResult pins = call(get("/api/v1/market/instruments/005930/events?period=3Y"), 200);
		assertThat((List<?>) JsonPath.read(pins.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.items[?(@.sourceCount > 0)]"))
			.isNotEmpty();
		call(get("/api/v1/market/instruments/005930/events?period=1D"), 400);
		call(get("/api/v1/market/instruments/999999/events"), 404);
		MvcResult strip = call(get("/api/v1/market/indices"), 200);
		// 코스닥은 하루뿐이라 빠지고(수집 전 칸), 나머지는 화면 순서대로
		assertThat((List<String>) JsonPath.read(strip.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.items[*].key"))
			.containsExactly("KOSPI", "KRXBOND", "GOLD", "USDKRW", "JPYKRW", "EURKRW", "CNYKRW");
		insight.saveIndex(IndexKey.KOSDAQ, List.of(new IndexValue(stripPrevDay, new java.math.BigDecimal("845.10"))), "키움증권");
		MvcResult full = call(get("/api/v1/market/indices"), 200);
		assertThat((List<String>) JsonPath.read(full.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.items[*].key"))
			.containsExactly("KOSPI", "KOSDAQ", "KRXBOND", "GOLD", "USDKRW", "JPYKRW", "EURKRW", "CNYKRW");
		call(get("/api/v1/market/industries?board=KOSPI"), 200);
		call(get("/api/v1/market/industries?board=KOSDAQ&limit=10"), 200);
		call(get("/api/v1/market/industries?board=ETF"), 400);
		call(get("/api/v1/market/industries?board=KOSPI&limit=11"), 400);
		call(get("/api/v1/market/industries"), 400);
		MvcResult feed = call(get("/api/v1/youth-news"), 200);
		// 카드 필드까지 검사되도록 두 건이 다 나와야 한다: 요약이 있는 카드와 summary·benefit·action이 모두 null인 카드(반려한 것은 빠짐)
		String feedBody = feed.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat((List<?>) JsonPath.read(feedBody, "$.items")).hasSize(2);
		assertThat((List<?>) JsonPath.read(feedBody, "$.items[?(@.summary != null)]")).hasSize(1);
		assertThat((List<?>) JsonPath.read(feedBody, "$.items[?(@.summary == null && @.benefit == null && @.action == null)]")).hasSize(1);
		call(get("/api/v1/youth-news?age=25&region=서울&category=HOUSING"), 200);
		call(get("/api/v1/youth-news?category=NOPE"), 400);
	}

	/** 목 서버(npm run mock:api)가 돌려주는 응답 example도 스펙에 맞아야 한다. 경로 변수가 없는 GET·PUT·POST의 200만 본다. */
	@Test
	void 목_서버_예시() throws Exception {
		ParseOptions options = new ParseOptions();
		options.setResolve(true);
		options.setResolveFully(true);
		OpenAPI api = new OpenAPIV3Parser()
			.readContents(Files.readString(Path.of("..", "docs", "contracts", "web-api.yaml")), null, options)
			.getOpenAPI();
		int checked = 0;
		for (var path : api.getPaths().entrySet()) {
			if (path.getKey().contains("{")) {
				continue;
			}
			for (var op : path.getValue().readOperationsMap().entrySet()) {
				var ok = op.getValue().getResponses().get("200");
				var media = ok == null || ok.getContent() == null ? null : ok.getContent().get("application/json");
				if (media == null || media.getExample() == null) {
					continue;
				}
				String body = Json.mapper().writeValueAsString(media.getExample());
				ValidationReport report = VALIDATOR.validateResponse("/api/v1" + path.getKey(), Request.Method.valueOf(op.getKey().name()),
						SimpleResponse.Builder.status(200).withContentType("application/json").withBody(body).build());
				List<String> errors = report.getMessages().stream()
					.filter(msg -> msg.getLevel() == ValidationReport.Level.ERROR)
					.map(msg -> msg.getKey() + ": " + msg.getMessage())
					.toList();
				assertThat(errors).as("%s %s example", op.getKey(), path.getKey()).isEmpty();
				checked++;
			}
		}
		assertThat(checked).as("example이 있는 응답 수").isGreaterThanOrEqualTo(6);
	}

	@Test
	void 적금() throws Exception {
		MvcResult list = call(get("/api/v1/savings/products?monthly=78000&termMonths=12"), 200);
		String body = list.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat((List<?>) JsonPath.read(body, "$.items")).hasSize(2);
		assertThat((Integer) JsonPath.read(body, "$.noRateCount")).isEqualTo(1);
		String id = JsonPath.read(body, "$.items[0].id");
		call(get("/api/v1/savings/products?monthly=78000&termMonths=36"), 200); // 맞는 상품이 없으면 min·max가 null
		call(get("/api/v1/savings/products?monthly=78000&termMonths=12&sort=MAX_RATE&direction=ASC&sectors=BANK&page=1&size=1"), 200);
		call(get("/api/v1/savings/products?monthly=0&termMonths=12"), 400);
		call(get("/api/v1/savings/products?monthly=78000&termMonths=12&sort=NOPE"), 400);
		call(get("/api/v1/savings/companies"), 200);
		call(get("/api/v1/savings/policies"), 200);
		call(get("/api/v1/savings/policies?ids=P1"), 200);
		call(get("/api/v1/savings/products/" + id + "?termMonths=12"), 200);
		call(get("/api/v1/savings/products/" + id + "?termMonths=36"), 404);
		call(get("/api/v1/savings/products/" + id + "?termMonths=12&reserveType=NOPE"), 400);
		String sim = "{\"productId\":\"%s\",\"monthly\":78000,\"termMonths\":12,\"reserveType\":\"FIXED\",\"rateBasis\":\"%s\"}";
		call(json(post("/api/v1/savings/simulate"), sim.formatted(id, "MAX")), 200);
		call(json(post("/api/v1/savings/simulate"), sim.formatted(id, "BASE")), 200);
		call(json(post("/api/v1/savings/simulate"), sim.formatted(id, "NOPE")), 400);
		call(json(post("/api/v1/savings/simulate"), sim.formatted("999999", "BASE")), 404);
	}

	@Test
	void 정기예금() throws Exception {
		MvcResult list = call(get("/api/v1/deposit/products?amount=10000000&termMonths=12"), 200);
		String body = list.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat((List<?>) JsonPath.read(body, "$.items")).hasSize(2);
		assertThat((Integer) JsonPath.read(body, "$.noRateCount")).isEqualTo(1);
		String id = JsonPath.read(body, "$.items[1].id"); // 기본금리 3.50 단리 상품
		call(get("/api/v1/deposit/products?amount=10000000&termMonths=36"), 200); // 맞는 상품이 없으면 min·max가 null
		call(get("/api/v1/deposit/products?amount=10000000&termMonths=12&interestType=COMPOUND&sort=MAX_RATE&direction=ASC&sectors=SAVINGS_BANK&page=1&size=1"), 200);
		call(get("/api/v1/deposit/products?amount=30000000&termMonths=12&companies=예시은행"), 200); // 한도 초과분 excludedAmount
		call(get("/api/v1/deposit/products?amount=0&termMonths=12"), 400);
		call(get("/api/v1/deposit/products?amount=10000000&termMonths=12&sort=NOPE"), 400);
		call(get("/api/v1/deposit/products?amount=10000000&termMonths=12&interestType=NOPE"), 400);
		call(get("/api/v1/deposit/companies"), 200);
		call(get("/api/v1/deposit/products/" + id + "?termMonths=12"), 200);
		call(get("/api/v1/deposit/products/" + id + "?termMonths=12&interestType=SIMPLE"), 200);
		call(get("/api/v1/deposit/products/" + id + "?termMonths=36"), 404);
		call(get("/api/v1/deposit/products/" + id + "?termMonths=12&interestType=COMPOUND"), 404);
		String sim = "{\"productId\":\"%s\",\"amount\":10000000,\"termMonths\":12,\"interestType\":\"SIMPLE\",\"rateBasis\":\"%s\"}";
		call(json(post("/api/v1/deposit/simulate"), sim.formatted(id, "MAX")), 200);
		call(json(post("/api/v1/deposit/simulate"), sim.formatted(id, "BASE")), 200);
		call(json(post("/api/v1/deposit/simulate"), sim.formatted(id, "NOPE")), 400);
		call(json(post("/api/v1/deposit/simulate"), sim.formatted("999999", "BASE")), 404);
	}

	@Test
	void 사건_퀴즈_시뮬레이션() throws Exception {
		MvcResult categories = call(get("/api/v1/practice/categories"), 200);
		String category = JsonPath.read(categories.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.categories[0].code");
		call(json(post("/api/v1/practice/start"), "{\"startId\":\"" + UUID.randomUUID() + "\",\"categoryCode\":\"" + category + "\",\"initialAmount\":500}"), 400);
		MvcResult started = call(json(post("/api/v1/practice/start"),
				"{\"startId\":\"" + UUID.randomUUID() + "\",\"categoryCode\":\"" + category + "\",\"initialAmount\":1000000}"), 200);
		String token = JsonPath.read(started.getResponse().getContentAsString(StandardCharsets.UTF_8), "$.sessionToken");
		String tokenBody = "{\"sessionToken\":\"" + token + "\"}";
		call(json(post("/api/v1/practice/state"), tokenBody), 200);
		// 한 번의 진행은 첫 사건까지 가고, 새 봉마다 자산을 돌려준다
		MvcResult stepped = call(json(post("/api/v1/practice/step"), command(token, 0)), 200);
		String body = stepped.getResponse().getContentAsString(StandardCharsets.UTF_8);
		assertThat((String) JsonPath.read(body, "$.status")).isEqualTo("AWAITING_DECISION");
		assertThat((Integer) JsonPath.read(body, "$.frames.length()")).isEqualTo(14);
		call(json(post("/api/v1/practice/step"), command(token, 1)), 409);
		String eventId = JsonPath.read(body, "$.event.id");
		String decision = "{\"sessionToken\":\"" + token + "\",\"commandId\":\"" + UUID.randomUUID() + "\",\"expectedVersion\":1,\"eventId\":\"" + eventId
				+ "\",\"prediction\":\"POSITIVE\",\"action\":\"HOLD\",\"allocationPercent\":";
		call(json(post("/api/v1/practice/decision"), decision + "50}"), 400);
		call(json(post("/api/v1/practice/decision"), decision + "0}"), 200);
		call(json(post("/api/v1/practice/end"), tokenBody), 204);
		call(json(post("/api/v1/practice/end"), tokenBody), 204);
		call(json(post("/api/v1/practice/state"), tokenBody), 410);
	}

	private static String command(String token, int version) {
		return "{\"sessionToken\":\"" + token + "\",\"commandId\":\"" + UUID.randomUUID() + "\",\"expectedVersion\":" + version + "}";
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
