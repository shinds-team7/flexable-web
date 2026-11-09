package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.math.BigDecimal;
import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.context.bean.override.mockito.MockitoSpyBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.model.Request;
import com.atlassian.oai.validator.model.SimpleResponse;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;
import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketService;
import com.flexable.web.savings.SavingsCatalogService;
import com.flexable.web.savings.SavingsCatalogService.OptionData;
import com.flexable.web.savings.SavingsCatalogService.ProductData;
import com.jayway.jsonpath.JsonPath;

/**
 * POST /goal/scenarios. 5년 넘는 시세가 있어야 200이 나오므로 ContractTest와 따로 DB를 채우고, 응답을 계약(web-api.yaml)으로 검사한다.
 * 400·503의 계약 검사는 ContractTest에도 있다.
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:goalscenario;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class GoalScenarioApiTest {

	private static final OpenApiInteractionValidator VALIDATOR = validator();
	private static final String BODY = "{\"name\":\"%s\",\"targetAmount\":%d,\"years\":%d}";

	@Autowired
	MockMvc mvc;
	@Autowired
	MarketService market;
	@Autowired
	SavingsCatalogService savings;
	@Autowired
	JdbcTemplate jdbc;
	@Autowired
	SavedScenarioRepository savedScenarios;
	@MockitoBean
	ScenarioProposer proposer;
	@MockitoSpyBean
	GoalScenarioAiProperties aiProps;

	private static boolean seeded;

	private static OpenApiInteractionValidator validator() {
		try {
			return OpenApiInteractionValidator
				.createForInlineApiSpecification(Files.readString(Path.of("..", "docs", "contracts", "web-api.yaml")))
				.withLevelResolver(LevelResolver.create().withLevel("validation.schema.additionalProperties", ValidationReport.Level.ERROR).build())
				.build();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	@BeforeEach
	void setup() {
		reset(proposer);
		when(proposer.enabled()).thenReturn(false);
		if (seeded) {
			return;
		}
		seeded = true;
		LocalDate today = LocalDate.now();
		// 우선주는 빠지고 다음 순위가 들어온다. ETF는 이름 끝이 200·S&P500인 것 중 시가총액 1위
		List<InstrumentRow> kospi = List.of(new InstrumentRow("005930", "삼성전자", "KOSPI", "STOCK", 900L),
				new InstrumentRow("005935", "삼성전자우", "KOSPI", "STOCK", 800L), new InstrumentRow("000660", "SK하이닉스", "KOSPI", "STOCK", 700L),
				new InstrumentRow("402340", "SK스퀘어", "KOSPI", "STOCK", 650L),
				new InstrumentRow("373220", "LG에너지솔루션", "KOSPI", "STOCK", 600L), new InstrumentRow("207940", "삼성바이오로직스", "KOSPI", "STOCK", 500L),
				new InstrumentRow("005380", "현대차", "KOSPI", "STOCK", 400L), new InstrumentRow("000270", "기아", "KOSPI", "STOCK", 300L));
		List<InstrumentRow> etf = List.of(new InstrumentRow("139260", "TIGER 200 IT", null, "ETF", 300L),
				new InstrumentRow("999200", "새로운 200", null, "ETF", 250L), new InstrumentRow("069500", "KODEX 200", null, "ETF", 200L), new InstrumentRow("102110", "TIGER 200", null, "ETF", 150L),
				new InstrumentRow("360750", "TIGER 미국S&P500", null, "ETF", 100L));
		market.replaceBoard(Board.KOSPI, kospi, "테스트 목록", null, today);
		market.replaceBoard(Board.ETF, etf, "테스트 목록", null, today);
		List<LocalDate> dates = new ArrayList<>();
		for (LocalDate d = today.minusYears(6); !d.isAfter(today); d = d.plusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				dates.add(d);
			}
		}
		Random rnd = new Random(7);
		// SK스퀘어·새로운 200은 상장한 지 3년이라 5년치 월말 종가가 없다(건너뛰고 다음 순위를 쓴다)
		LocalDate listed = today.minusYears(3);
		for (InstrumentRow row : concat(kospi, etf)) {
			List<DailyClose> closes = new ArrayList<>();
			double v = Math.log(10_000 + rnd.nextInt(50_000));
			boolean young = row.code().equals("402340") || row.code().equals("999200");
			for (LocalDate d : dates) {
				if (young && d.isBefore(listed)) {
					continue;
				}
				v += rnd.nextGaussian() * 0.012 + 0.0002;
				closes.add(new DailyClose(d, Math.max(1, Math.round(Math.exp(v)))));
			}
			market.saveDailyCloses(row.code(), closes, Map.of(), "테스트");
		}
		// 12개월만 있다. 한도 있는 상품·제한 있는 상품·저축은행 상품·사업자 전용 은행 상품은 후보에서 빠진다
		savings.replaceAll(List.of(
				new ProductData("0020001", "D", "SAVINGS_BANK", "202610", "예시저축은행", "저축은행 적금", "영업점", null, null, "1", "실명의 개인", null, null,
						"20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, new BigDecimal("6.00"), null))),
				new ProductData("0010004", "E", "BANK", "202610", "예시산업은행", "기업 적금", "영업점", null, null, "1", "개인사업자, 조합(비영리법인 포함), 법인",
						null, null, "20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, new BigDecimal("3.68"), null))),
				new ProductData("0010001", "A", "BANK", "202610", "예시은행", "한도 있는 적금", "영업점", null, null, "1", null, null, 300_000L,
						"20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, new BigDecimal("4.50"), null))),
				new ProductData("0010002", "B", "BANK", "202610", "예시은행", "서민 전용 적금", "영업점", null, null, "2", null, null, null,
						"20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, new BigDecimal("4.00"), null))),
				new ProductData("0010003", "C", "BANK", "202610", "열린은행", "누구나 적금", "인터넷", null, null, "1", "실명의 개인", null, null,
						"20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, new BigDecimal("3.50"), null))),
				openSaving("0010005", "F", "둘째 적금", "3.20"), openSaving("0010006", "G", "셋째 적금", "3.00"), openSaving("0010007", "H", "넷째 적금", "2.80")));
	}

	private static ProductData openSaving(String company, String code, String name, String rate) {
		return new ProductData(company, code, "BANK", "202610", "함께은행", name, "인터넷", null, null, "1", "실명의 개인", null, null,
				"20261001", null, "202610011000", List.of(new OptionData("S", "S", 12, new BigDecimal(rate), null)));
	}

	private static List<InstrumentRow> concat(List<InstrumentRow> a, List<InstrumentRow> b) {
		List<InstrumentRow> out = new ArrayList<>(a);
		out.addAll(b);
		return out;
	}

	private String call(String body, int expectedStatus) throws Exception {
		return send(post("/api/v1/goal/scenarios").contentType(MediaType.APPLICATION_JSON).content(body), expectedStatus);
	}

	/** 요청을 보내고 상태 코드를 확인한 뒤 응답을 계약(web-api.yaml)으로 검사한다. */
	private String send(MockHttpServletRequestBuilder req, int expectedStatus) throws Exception {
		MvcResult r = mvc.perform(req).andReturn();
		var res = r.getResponse();
		String out = res.getContentAsString(StandardCharsets.UTF_8);
		assertThat(res.getStatus()).as(out).isEqualTo(expectedStatus);
		SimpleResponse.Builder b = SimpleResponse.Builder.status(res.getStatus());
		if (res.getContentType() != null) {
			b.withContentType(res.getContentType());
		}
		if (!out.isEmpty()) {
			b.withBody(out);
		}
		List<String> errors = VALIDATOR.validateResponse(r.getRequest().getRequestURI(), Request.Method.valueOf(r.getRequest().getMethod()), b.build())
			.getMessages().stream()
			.filter(m -> m.getLevel() == ValidationReport.Level.ERROR).map(m -> m.getKey() + ": " + m.getMessage()).toList();
		assertThat(errors).as("계약과 다름: %s", out).isEmpty();
		return out;
	}

	private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder req, String token) {
		return req.header("Authorization", "Bearer " + token);
	}

	private String signup() throws Exception {
		String email = "g" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
		String body = send(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"" + email + "\",\"password\":\"password1\",\"agreeTerms\":true}"), 201);
		return JsonPath.read(body, "$.accessToken");
	}

	private String save(String token, String resultId, String scenarioId, int expectedStatus) throws Exception {
		return send(auth(post("/api/v1/me/goal/scenarios").contentType(MediaType.APPLICATION_JSON)
			.content("{\"resultId\":\"" + resultId + "\",\"scenarioId\":\"" + scenarioId + "\"}"), token), expectedStatus);
	}

	@Test
	void 데모_조합으로_세_시나리오를_계산한다() throws Exception {
		long started = System.nanoTime();
		String body = call(BODY.formatted("  1년 안에 목돈  ", 15_000_000, 1), 200);
		long elapsedMs = (System.nanoTime() - started) / 1_000_000;
		assertThat(elapsedMs).as("계산 시간(ms)").isLessThan(10_000);

		assertThat((String) JsonPath.read(body, "$.name")).isEqualTo("1년 안에 목돈");
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("DEMO");
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_UNAVAILABLE");
		assertThat((Integer) JsonPath.read(body, "$.months")).isEqualTo(12);
		assertThat((List<String>) JsonPath.read(body, "$.scenarios[*].id")).containsExactly("steady", "spread", "bold");
		// 상품 고르기: 개인이 가입할 수 있는 은행의 한도·제한 없는 적금(저축은행·기업 전용 제외), 이름 끝 200 중 5년치 자료가 있는 1위(KODEX 200), 우선주·신규 상장(SK스퀘어)을 뺀 코스피 5개
		assertThat((String) JsonPath.read(body, "$.products[0].items[0].name")).isEqualTo("누구나 적금");
		assertThat((String) JsonPath.read(body, "$.products[0].ratePercent")).isEqualTo("3.50");
		assertThat((String) JsonPath.read(body, "$.products[2].items[0].code")).isEqualTo("069500");
		assertThat((String) JsonPath.read(body, "$.products[3].items[0].code")).isEqualTo("360750");
		assertThat((List<String>) JsonPath.read(body, "$.products[4].items[*].code")).containsExactly("005930", "000660", "373220", "207940", "005380");
		// 적금·CMA만이면 확정형, 투자를 섞으면 범위
		assertThat((String) JsonPath.read(body, "$.scenarios[0].outcome.kind")).isEqualTo("FIXED");
		assertThat((Integer) JsonPath.read(body, "$.scenarios[0].outcome.chanceBp")).isEqualTo(10000);
		assertThat((String) JsonPath.read(body, "$.scenarios[1].outcome.kind")).isEqualTo("RANGE");
		for (int i = 0; i < 3; i++) {
			if ((Boolean) JsonPath.read(body, "$.scenarios[" + i + "].reachable")) {
				long monthly = ((Number) JsonPath.read(body, "$.scenarios[" + i + "].monthly")).longValue();
				assertThat(monthly % 1000).isZero();
				long sum = ((List<Number>) JsonPath.read(body, "$.scenarios[" + i + "].mix[*].monthly")).stream().mapToLong(Number::longValue).sum();
				assertThat(sum).as("금액 보존").isEqualTo(monthly);
				assertThat((Integer) JsonPath.read(body, "$.scenarios[" + i + "].outcome.chanceBp")).isGreaterThanOrEqualTo(8000);
			}
		}
	}

	@Test
	void 적금과_지수_ETF는_다음_순위를_함께_볼_상품으로_보여_준다() throws Exception {
		String body = call(BODY.formatted("목돈", 15_000_000, 1), 200);
		// 데모 조합이어도 서버가 고른 상품은 같다. 적금은 금리 순 최대 2개(넷째는 빠짐)
		assertThat((List<String>) JsonPath.read(body, "$.products[0].alternatives[*].name")).containsExactly("둘째 적금", "셋째 적금");
		assertThat((String) JsonPath.read(body, "$.products[0].alternatives[0].company")).isEqualTo("함께은행");
		assertThat((String) JsonPath.read(body, "$.products[0].alternatives[0].ratePercent")).isEqualTo("3.20");
		// 후보가 모자라면 있는 만큼만: 국내는 5년치 자료가 있는 TIGER 200 하나, 미국은 없음
		assertThat((List<String>) JsonPath.read(body, "$.products[2].alternatives[*].code")).containsExactly("102110");
		assertThat((Object) JsonPath.read(body, "$.products[2].alternatives[0].ratePercent")).isNull();
		assertThat((List<?>) JsonPath.read(body, "$.products[3].alternatives")).isEmpty();
		// CMA·코스피는 함께 볼 상품이 없다
		assertThat((List<?>) JsonPath.read(body, "$.products[1].alternatives")).isEmpty();
		assertThat((List<?>) JsonPath.read(body, "$.products[4].alternatives")).isEmpty();
		// 계산에 쓰는 상품은 그대로 1순위 하나
		assertThat((List<?>) JsonPath.read(body, "$.products[0].items")).hasSize(1);
		assertThat((List<?>) JsonPath.read(body, "$.products[2].items")).hasSize(1);
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 함께_볼_상품의_값은_해설에_쓸_수_있고_보내지_않은_값은_지운다(CapturedOutput output) throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenAnswer(call -> {
			ScenarioProposer.Input input = call.getArgument(0);
			ScenarioProposer.AltStat tiger = input.stats().stream().filter(s -> s.type().equals("KR_INDEX_ETF")).findFirst().orElseThrow().alternatives().getFirst();
			assertThat(tiger.name()).isEqualTo("TIGER 200");
			String drawdown = new BigDecimal(tiger.maxDrawdown()).movePointRight(2).abs().toPlainString();
			return List.of(new Proposals.Draft("a", "저축만", "적금 위주", "둘째 적금의 금리는 연 3.2%예요. 넷째 적금의 금리는 연 2.8%예요.", Map.of("SAVINGS", 100)),
					new Proposals.Draft("b", "반반", "적금과 지수 ETF", "TIGER 200의 지난 60개월 최대 하락은 " + drawdown + "%예요.", Map.of("SAVINGS", 50, "KR_INDEX_ETF", 50)), THIRD);
		});
		String body = member(BODY.formatted("목돈", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("AI");
		assertThat((String) JsonPath.read(body, "$.scenarios[0].explanation")).isEqualTo("둘째 적금의 금리는 연 3.2%예요.");
		assertThat((String) JsonPath.read(body, "$.scenarios[1].explanation")).contains("TIGER 200의 지난 60개월 최대 하락은");
		assertThat(output).contains("goal scenario AI sentence removed: TEXT_NUMBER #1.explanation").doesNotContain("sentence removed: TEXT_NUMBER #2");
	}

	@Test
	void 함께_볼_상품이_없는_이전_저장본은_빈_목록으로_읽는다() throws Exception {
		String token = signup();
		String resultId = JsonPath.read(call(BODY.formatted("목돈", 15_000_000, 1), 200), "$.resultId");
		long id = ((Number) JsonPath.read(save(token, resultId, "steady", 201), "$.id")).longValue();
		String snapshot = jdbc.queryForObject("select snapshot from goal_scenarios where id = ?", String.class, id);
		String old = JsonPath.parse(snapshot).delete("$.products[*].alternatives").delete("$.alternatives").jsonString();
		assertThat(old).isNotEqualTo(snapshot).doesNotContain("alternatives");
		jdbc.update("update goal_scenarios set snapshot = ? format json where id = ?", old, id);
		String saved = send(auth(get("/api/v1/me/goal/scenarios/" + id), token), 200);
		assertThat((List<?>) JsonPath.read(saved, "$.products[0].alternatives")).isEmpty();
	}

	@Test
	void 같은_입력이면_같은_응답이다() throws Exception {
		String a = call(BODY.formatted("목돈", 20_000_000, 1), 200);
		String b = call(BODY.formatted("목돈", 20_000_000, 1), 200);
		// 저장용 resultId만 매번 다르다
		assertThat((String) JsonPath.read(a, "$.resultId")).isNotEqualTo(JsonPath.read(b, "$.resultId"));
		String id = "\"resultId\":\"[^\"]+\"";
		assertThat(a.replaceFirst(id, "")).isEqualTo(b.replaceFirst(id, ""));
	}

	@Test
	void 입력이_범위를_벗어나면_400() throws Exception {
		call(BODY.formatted("목돈", 15_000_000, 4), 400);
		call(BODY.formatted("목돈", 999_999, 1), 400);
		call(BODY.formatted("   ", 15_000_000, 1), 400);
		call("{\"name\":\"목돈\",\"years\":1}", 400);
	}

	@Test
	void 맞는_적금이_없으면_503() throws Exception {
		String body = call(BODY.formatted("목돈", 30_000_000, 2), 503);
		assertThat((String) JsonPath.read(body, "$.field")).isEqualTo("SAVINGS");
	}

	/** 제안은 시나리오 3개여야 한다. 각 테스트가 보는 앞쪽 두 개 뒤에 붙인다. */
	private static final Proposals.Draft THIRD = new Proposals.Draft("c", "지수만", "지수 ETF 위주", "지수 ETF에 담아요", Map.of("KR_INDEX_ETF", 100));
	private static final List<Proposals.Draft> GOOD = List.of(
			new Proposals.Draft("a", "저축만", "적금 위주", "적금으로 모아요", Map.of("SAVINGS", 100)),
			new Proposals.Draft("b", "반반", "적금과 지수 ETF", "반씩 나눠요", Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)), THIRD);
	private static final List<Proposals.Draft> BAD = List.of(
			new Proposals.Draft("a", "코인", "코인", "코인이에요", Map.of("BITCOIN", 100)),
			new Proposals.Draft("b", "적금", "적금", "적금이에요", Map.of("SAVINGS", 100)), THIRD);

	private String member(String body, String token, int expectedStatus) throws Exception {
		return send(auth(post("/api/v1/goal/scenarios").contentType(MediaType.APPLICATION_JSON).content(body), token), expectedStatus);
	}

	@Test
	void 비회원은_AI_대신_데모() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		String body = call(BODY.formatted("목돈", 15_000_000, 1), 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("DEMO");
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("GUEST");
		assertThat((Object) JsonPath.read(body, "$.aiUsage")).isNull();
		assertThat((Boolean) JsonPath.read(body, "$.aiReused")).isFalse();
		verify(proposer, times(0)).propose(any());
	}

	@Test
	void 회원은_AI_조합을_받고_목표_이름은_보내지_않는다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(GOOD);
		String token = signup();
		String body = member(BODY.formatted("비밀 목표", 15_000_000, 1), token, 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("AI");
		assertThat((Object) JsonPath.read(body, "$.fallbackReason")).isNull();
		assertThat((List<String>) JsonPath.read(body, "$.scenarios[*].id")).containsExactly("a", "b", "c");
		// 적금 100%·3.50%·1년·목표 1,500만 원 = 정책 예시(1,231,000원)
		assertThat((Integer) JsonPath.read(body, "$.scenarios[0].monthly")).isEqualTo(1_231_000);
		assertThat((Integer) JsonPath.read(body, "$.scenarios[0].outcome.fixedAmount")).isEqualTo(15_008_920);
		assertThat((Integer) JsonPath.read(body, "$.aiUsage.limitPerDay")).isEqualTo(3);
		assertThat((Integer) JsonPath.read(body, "$.aiUsage.remainingToday")).isEqualTo(2);
		org.mockito.ArgumentCaptor<ScenarioProposer.Input> sent = org.mockito.ArgumentCaptor.forClass(ScenarioProposer.Input.class);
		verify(proposer).propose(sent.capture());
		assertThat(sent.getValue().targetAmount()).isEqualTo(15_000_000);
		assertThat(sent.getValue().stats()).extracting(ScenarioProposer.TypeStat::type)
			.containsExactly("SAVINGS", "CMA", "KR_INDEX_ETF", "US_INDEX_ETF", "KOSPI_TOP5");
		assertThat(sent.getValue().toString()).doesNotContain("비밀 목표");
	}

	@Test
	void 같은_회원이_같은_조건으로_다시_보면_재사용하고_차감하지_않는다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(GOOD);
		String a = signup();
		String first = member(BODY.formatted("목돈", 16_000_000, 1), a, 200);
		assertThat((Boolean) JsonPath.read(first, "$.aiReused")).isFalse();
		assertThat((Integer) JsonPath.read(first, "$.aiUsage.remainingToday")).isEqualTo(2);
		String again = member(BODY.formatted("다른 이름", 16_000_000, 1), a, 200);
		assertThat((String) JsonPath.read(again, "$.proposer")).isEqualTo("AI");
		assertThat((Boolean) JsonPath.read(again, "$.aiReused")).isTrue();
		assertThat((Integer) JsonPath.read(again, "$.aiUsage.remainingToday")).isEqualTo(2);
		verify(proposer, times(1)).propose(any());
	}

	@Test
	void 다른_회원은_같은_조건이어도_새로_부르고_차감한다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(GOOD);
		member(BODY.formatted("목돈", 16_500_000, 1), signup(), 200);
		String other = member(BODY.formatted("목돈", 16_500_000, 1), signup(), 200);
		assertThat((Boolean) JsonPath.read(other, "$.aiReused")).isFalse();
		assertThat((Integer) JsonPath.read(other, "$.aiUsage.remainingToday")).isEqualTo(2);
		verify(proposer, times(2)).propose(any());
	}

	@Test
	void AI_제안이_규칙을_어기거나_실패하면_데모() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(BAD);
		String token = signup();
		String rejected = member(BODY.formatted("목돈", 17_000_000, 1), token, 200);
		assertThat((String) JsonPath.read(rejected, "$.proposer")).isEqualTo("DEMO");
		assertThat((String) JsonPath.read(rejected, "$.fallbackReason")).isEqualTo("AI_REJECTED");

		when(proposer.propose(any())).thenThrow(new ScenarioProposer.Failed("시간 초과"));
		String failed = member(BODY.formatted("목돈", 17_000_000, 1), token, 200);
		assertThat((String) JsonPath.read(failed, "$.fallbackReason")).isEqualTo("AI_FAILED");
		// 결과를 못 받았으니 회원 횟수는 되돌린다(서비스 전체 횟수는 그대로)
		assertThat((Integer) JsonPath.read(rejected, "$.aiUsage.remainingToday")).isEqualTo(3);
		assertThat((Integer) JsonPath.read(failed, "$.aiUsage.remainingToday")).isEqualTo(3);
	}

	@Test
	void AI_문구에_서버가_확인할_수_있는_숫자는_쓸_수_있다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(List.of(
				new Proposals.Draft("a", "적금으로 1년", "연 3.5% 적금으로 모아요",
						"1년 안에 1,500만 원을 모으도록 적금 100%로 정했어요. 수익이 보장되지 않는 상품은 넣지 않았어요.", Map.of("SAVINGS", 100)),
				new Proposals.Draft("b", "반반", "적금과 S&P 500 지수",
						"적금 50%와 미국 S&P 500 지수 50%로 나눴어요. 이익에는 15.4% 세금이 붙어요.", Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)), THIRD));
		String body = member(BODY.formatted("목돈", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("AI");
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void AI가_새로_만든_숫자는_막고_로그에는_이유만_남긴다(CapturedOutput output) throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(List.of(
				new Proposals.Draft("a", "저축만", "적금 위주", "적금으로 모아요", Map.of("SAVINGS", 100)),
				new Proposals.Draft("b", "반반", "적금과 지수 ETF", "연 7% 수익을 노려 반씩 나눠요", Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)), THIRD));
		String body = member(BODY.formatted("비밀 목표", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_REJECTED");
		assertThat(output).contains("goal scenario AI rejected: TEXT_NUMBER #2.explanation").doesNotContain("연 7%").doesNotContain("비밀 목표");
	}

	@Test
	void AI에게_보낸_통계를_인용한_해설은_통과한다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenAnswer(call -> {
			ScenarioProposer.Input input = call.getArgument(0);
			ScenarioProposer.TypeStat us = input.stats().stream().filter(s -> s.type().equals("US_INDEX_ETF")).findFirst().orElseThrow();
			String drawdown = new java.math.BigDecimal(us.maxDrawdown()).movePointRight(2).abs().toPlainString();
			return List.of(new Proposals.Draft("a", "저축만", "적금 위주", "적금으로 모아요", Map.of("SAVINGS", 100)),
					new Proposals.Draft("b", "반반", "적금과 지수 ETF", "지난 60개월 최대 하락 " + drawdown + "%를 고려했어요", Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)), THIRD);
		});
		String body = member(BODY.formatted("비밀 목표", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("AI");
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 옵션을_켜면_걸린_칸의_문구만_로그에_남긴다(CapturedOutput output) throws Exception {
		when(aiProps.logRejected()).thenReturn(true);
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(List.of(
				new Proposals.Draft("a", "저축만", "적금 위주", "다른 칸의 해설이에요", Map.of("SAVINGS", 100)),
				new Proposals.Draft("b", "반반", "요약 문구예요", "연 7% 수익을 노려요", Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)), THIRD));
		String body = member(BODY.formatted("비밀 목표", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_REJECTED");
		assertThat(output).contains("goal scenario AI rejected: TEXT_NUMBER #2.explanation \"연 7% 수익을 노려요\"")
			.doesNotContain("다른 칸의 해설이에요").doesNotContain("요약 문구예요").doesNotContain("비밀 목표");
	}

	private static List<Proposals.Draft> oneBadSentence() {
		return List.of(new Proposals.Draft("a", "저축만", "적금 위주", "적금으로 모아요", Map.of("SAVINGS", 100)),
				new Proposals.Draft("b", "반반", "요약 문구예요", "적금으로 바닥을 받쳐요. 연 7% 수익을 노려요.\n\n기한이 다가오면 줄여요.", Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)), THIRD);
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 해설의_걸린_문장만_지우고_AI_조합을_유지한다(CapturedOutput output) throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(oneBadSentence());
		String body = member(BODY.formatted("비밀 목표", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("AI");
		assertThat((String) JsonPath.read(body, "$.scenarios[1].explanation")).isEqualTo("적금으로 바닥을 받쳐요.\n\n기한이 다가오면 줄여요.");
		assertThat(output).contains("goal scenario AI sentence removed: TEXT_NUMBER #2.explanation").doesNotContain("연 7%");
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void 옵션을_켜면_지운_문장만_로그에_남긴다(CapturedOutput output) throws Exception {
		when(aiProps.logRejected()).thenReturn(true);
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(oneBadSentence());
		member(BODY.formatted("비밀 목표", 15_000_000, 1), signup(), 200);
		assertThat(output).contains("goal scenario AI sentence removed: TEXT_NUMBER #2.explanation \"연 7% 수익을 노려요.\"")
			.doesNotContain("적금으로 바닥을 받쳐요").doesNotContain("비밀 목표");
	}

	@Test
	@ExtendWith(OutputCaptureExtension.class)
	void AI_호출_실패는_원인_분류만_로그에_남긴다(CapturedOutput output) throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenThrow(new ScenarioProposer.Failed("TRUNCATED"));
		String body = member(BODY.formatted("비밀 목표", 15_000_000, 1), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_FAILED");
		assertThat(output).contains("goal scenario AI failed: TRUNCATED").doesNotContain("비밀 목표");
	}

	@Test
	void 하루_세_번을_넘기면_데모() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(GOOD);
		String token = signup();
		for (int i = 0; i < 3; i++) {
			member(BODY.formatted("목돈", 18_000_000 + i * 1_000_000L, 1), token, 200);
		}
		String over = member(BODY.formatted("목돈", 25_000_000, 1), token, 200);
		assertThat((String) JsonPath.read(over, "$.fallbackReason")).isEqualTo("LIMIT");
		assertThat((Integer) JsonPath.read(over, "$.aiUsage.remainingToday")).isZero();
		verify(proposer, times(3)).propose(any());
	}

	@Test
	void 서비스_전체_상한을_넘기면_데모이고_회원_횟수는_되돌린다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.propose(any())).thenReturn(GOOD);
		String token = signup();
		java.time.LocalDate today = java.time.LocalDate.now(java.time.ZoneId.of("Asia/Seoul"));
		jdbc.update("DELETE FROM goal_scenario_ai_daily WHERE usage_date = ?", today);
		jdbc.update("INSERT INTO goal_scenario_ai_daily (usage_date, count) VALUES (?, 300)", today);
		try {
			String capped = member(BODY.formatted("목돈", 26_000_000, 1), token, 200);
			assertThat((String) JsonPath.read(capped, "$.fallbackReason")).isEqualTo("DAILY_CAP");
			assertThat((Integer) JsonPath.read(capped, "$.aiUsage.remainingToday")).isEqualTo(3);
			verify(proposer, times(0)).propose(any());
		}
		finally {
			jdbc.update("DELETE FROM goal_scenario_ai_daily WHERE usage_date = ?", today);
		}
	}

	@Test
	void 회원은_본_결과를_그대로_저장하고_지울_수_있다() throws Exception {
		String token = signup();
		String result = call(BODY.formatted("여행 자금", 15_000_000, 1), 200);
		String resultId = JsonPath.read(result, "$.resultId");
		String saved = save(token, resultId, "spread", 201);
		assertThat((String) JsonPath.read(saved, "$.name")).isEqualTo("여행 자금");
		assertThat((String) JsonPath.read(saved, "$.scenario.id")).isEqualTo("spread");
		assertThat(((Number) JsonPath.read(saved, "$.scenario.monthly")).longValue())
			.isEqualTo(((Number) JsonPath.read(result, "$.scenarios[1].monthly")).longValue());
		assertThat((Object) JsonPath.read(saved, "$.scenario.outcome")).isEqualTo(JsonPath.read(result, "$.scenarios[1].outcome"));
		long id = ((Number) JsonPath.read(saved, "$.id")).longValue();

		String list = send(auth(get("/api/v1/me/goal/scenarios"), token), 200);
		assertThat((List<?>) JsonPath.read(list, "$.items")).hasSize(1);
		assertThat((Integer) JsonPath.read(list, "$.limit")).isEqualTo(5);
		assertThat((String) JsonPath.read(list, "$.items[0].title")).isEqualTo("나눠서 키우기");
		assertThat(send(auth(get("/api/v1/me/goal/scenarios/" + id), token), 200)).isEqualTo(saved);

		// 다른 회원은 볼 수도 지울 수도 없다
		String other = signup();
		send(auth(get("/api/v1/me/goal/scenarios/" + id), other), 404);
		send(auth(delete("/api/v1/me/goal/scenarios/" + id), other), 404);

		send(auth(delete("/api/v1/me/goal/scenarios/" + id), token), 204);
		send(auth(get("/api/v1/me/goal/scenarios/" + id), token), 404);
		assertThat((List<?>) JsonPath.read(send(auth(get("/api/v1/me/goal/scenarios"), token), 200), "$.items")).isEmpty();
	}

	@Test
	void 저장하면_고른_플랜과_나머지_플랜을_모두_그대로_돌려준다() throws Exception {
		String token = signup();
		String result = call(BODY.formatted("여행 자금", 15_000_000, 1), 200);
		String saved = save(token, JsonPath.read(result, "$.resultId"), "spread", 201);
		assertThat((String) JsonPath.read(saved, "$.scenario.id")).isEqualTo("spread");
		assertThat((List<String>) JsonPath.read(saved, "$.alternatives[*].id")).containsExactly("steady", "bold");
		assertThat((Object) JsonPath.read(saved, "$.alternatives[0]")).isEqualTo(JsonPath.read(result, "$.scenarios[0]"));
		assertThat((Object) JsonPath.read(saved, "$.alternatives[1]")).isEqualTo(JsonPath.read(result, "$.scenarios[2]"));

		// 목록은 고른 플랜 기준이고, 플랜 전체를 저장해도 1개로 센다
		String list = send(auth(get("/api/v1/me/goal/scenarios"), token), 200);
		assertThat((List<?>) JsonPath.read(list, "$.items")).hasSize(1);
		assertThat((String) JsonPath.read(list, "$.items[0].title")).isEqualTo("나눠서 키우기");
	}

	@Test
	void 플랜_하나만_저장하던_저장본은_나머지_플랜이_빈_목록이다() throws Exception {
		String token = signup();
		String result = call(BODY.formatted("여행 자금", 15_000_000, 1), 200);
		long id = ((Number) JsonPath.read(save(token, JsonPath.read(result, "$.resultId"), "spread", 201), "$.id")).longValue();
		SavedScenario row = savedScenarios.findById(id).orElseThrow();
		String legacy = JsonPath.parse(row.getSnapshot()).delete("$.alternatives").jsonString();
		savedScenarios.delete(row);
		long legacyId = savedScenarios.save(new SavedScenario(row.getUserId(), row.getSavedAt(), row.getName(), row.getTargetAmount(), row.getYears(), legacy)).getId();

		String body = send(auth(get("/api/v1/me/goal/scenarios/" + legacyId), token), 200);
		assertThat((String) JsonPath.read(body, "$.scenario.id")).isEqualTo("spread");
		assertThat((List<?>) JsonPath.read(body, "$.alternatives")).isEmpty();
	}

	@Test
	void 다섯_개까지만_저장한다() throws Exception {
		String token = signup();
		String resultId = JsonPath.read(call(BODY.formatted("목돈", 15_000_000, 1), 200), "$.resultId");
		for (int i = 0; i < 5; i++) {
			save(token, resultId, i % 2 == 0 ? "steady" : "bold", 201);
		}
		String over = save(token, resultId, "spread", 409);
		assertThat((String) JsonPath.read(over, "$.code")).isEqualTo("GOAL_SCENARIO_LIMIT");
		assertThat((List<?>) JsonPath.read(send(auth(get("/api/v1/me/goal/scenarios"), token), 200), "$.items")).hasSize(5);
	}

	@Test
	void 저장_오류() throws Exception {
		send(get("/api/v1/me/goal/scenarios"), 401);
		String token = signup();
		String expired = save(token, "no-such-result", "spread", 409);
		assertThat((String) JsonPath.read(expired, "$.code")).isEqualTo("GOAL_SCENARIO_EXPIRED");
		String resultId = JsonPath.read(call(BODY.formatted("목돈", 15_000_000, 1), 200), "$.resultId");
		save(token, resultId, "nope", 400);
		save(token, "", "spread", 400);
		send(auth(get("/api/v1/me/goal/scenarios/999999"), token), 404);
	}

	@Test
	void 탈퇴하면_저장한_시나리오도_지운다() throws Exception {
		String token = signup();
		String resultId = JsonPath.read(call(BODY.formatted("목돈", 15_000_000, 1), 200), "$.resultId");
		long id = ((Number) JsonPath.read(save(token, resultId, "steady", 201), "$.id")).longValue();
		int status = mvc.perform(auth(delete("/api/v1/me"), token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"password1\",\"confirm\":\"탈퇴\"}")).andReturn().getResponse().getStatus();
		assertThat(status).isEqualTo(204);
		assertThat(jdbc.queryForObject("select count(*) from goal_scenarios where id = ?", Integer.class, id)).isZero();
	}

	@Test
	void 탈퇴한_회원의_토큰으로_보면_401() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		String token = signup();
		int status = mvc.perform(auth(delete("/api/v1/me"), token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"password1\",\"confirm\":\"탈퇴\"}")).andReturn().getResponse().getStatus();
		assertThat(status).isEqualTo(204);
		member(BODY.formatted("목돈", 15_000_000, 1), token, 401);
		verify(proposer, times(0)).propose(any());
	}
}
