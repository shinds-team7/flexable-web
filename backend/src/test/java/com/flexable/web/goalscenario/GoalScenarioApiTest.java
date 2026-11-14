package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.Mockito.never;
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
 * POST /goal/scenarios(#431: 시작 금액·월 납입 가능액·기한, 목표 금액 선택). 5년 넘는 시세가 있어야 200이 나오므로 ContractTest와 따로 DB를 채우고, 응답을 계약(web-api.yaml)으로 검사한다.
 * 400·503의 계약 검사는 ContractTest에도 있다.
 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:goalscenario;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class GoalScenarioApiTest {

	private static final OpenApiInteractionValidator VALIDATOR = validator();

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

	private static final String VERSION = "goal-scenario-test";

	/** 단계 범위(안정 0~30·균형 31~60·적극 61~100)를 지킨 조합. 순서를 섞어 둔다(서버가 위험 순으로 줄 세운다). */
	private static final List<Proposals.Draft> GOOD = List.of(
			new Proposals.Draft("s3", "적극", "지수 ETF 위주", new Proposals.Parts("기한이 길어요.", "지수 ETF가 대부분이에요.", "가장 크게 흔들려요.", "기다릴 수 있을 때 맞아요."),
					Map.of("CMA", 20, "KR_INDEX_ETF", 40, "US_INDEX_ETF", 40)),
			new Proposals.Draft("s1", "안정", "적금 위주", new Proposals.Parts("기한이 짧아요.", "적금으로 모아요.", "가장 덜 흔들려요.", "안정을 원할 때 맞아요."),
					Map.of("SAVINGS", 100)),
			new Proposals.Draft("s2", "균형", "반씩", new Proposals.Parts("나눠 담아요.", "반씩 나눠요.", "중간이에요.", "조금 흔들려도 될 때 맞아요."),
					Map.of("SAVINGS", 50, "US_INDEX_ETF", 50)));

	/** 균형 단계에 투자 몫 20%를 둔 조합(단계 범위 위반). */
	private static final List<Proposals.Draft> OFF_TIER = List.of(GOOD.get(1),
			new Proposals.Draft("s2", "균형", "반씩", new Proposals.Parts("나눠 담아요.", "반씩 나눠요.", "중간이에요.", "맞아요."), Map.of("SAVINGS", 80, "US_INDEX_ETF", 20)),
			GOOD.get(0));

	@Autowired
	GoalScenarioService service;
	@Autowired
	ScenarioPlanStore plans;
	@Autowired
	ScenarioAiQuota quota;

	private static String body(long start, long monthly, int months) {
		return "{\"startAmount\":%d,\"monthlyBudget\":%d,\"months\":%d}".formatted(start, monthly, months);
	}

	private static String body(long start, long monthly, int months, long target) {
		return "{\"startAmount\":%d,\"monthlyBudget\":%d,\"months\":%d,\"targetAmount\":%d}".formatted(start, monthly, months, target);
	}

	private String call(String body, int expectedStatus) throws Exception {
		return send(post("/api/v1/goal/scenarios").contentType(MediaType.APPLICATION_JSON).content(body), expectedStatus);
	}

	private String member(String body, String token, int expectedStatus) throws Exception {
		return send(auth(post("/api/v1/goal/scenarios").contentType(MediaType.APPLICATION_JSON).content(body), token), expectedStatus);
	}

	private String save(String token, String resultId, String scenarioId, String name, int expectedStatus) throws Exception {
		return send(auth(post("/api/v1/me/goal/scenarios").contentType(MediaType.APPLICATION_JSON)
			.content("{\"resultId\":\"" + resultId + "\",\"scenarioId\":\"" + scenarioId + "\",\"name\":\"" + name + "\"}"), token), expectedStatus);
	}

	/** AI를 켜고 이 기한의 조합을 미리 만들어 둔다(worker가 하는 일, #431). */
	private void prepare(int months, List<Proposals.Draft> drafts) {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.planVersion()).thenReturn(VERSION);
		GoalScenarioService.PlanTarget target = service.planTargets().stream().filter(t -> t.months() == months).findFirst().orElseThrow();
		jdbc.update("DELETE FROM goal_scenario_plans WHERE prompt_version = ? AND months = ?", VERSION, months);
		plans.save(VERSION, months, target.subject().fingerprint(), drafts, "test-model");
	}

	@Test
	void 데모_조합으로_안정_균형_적극_세_시나리오를_계산한다() throws Exception {
		call(body(1_000_000, 500_000, 36), 200);
		long started = System.nanoTime();
		String body = call(body(1_000_000, 500_000, 36), 200);
		long elapsedMs = (System.nanoTime() - started) / 1_000_000;
		// 발표 조건은 2초다. 테스트 환경의 흔들림을 감안해 여유를 둔다(운영은 서버 로그 timing으로 본다)
		assertThat(elapsedMs).as("계산 시간(ms)").isLessThan(5_000);

		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("DEMO");
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_UNAVAILABLE");
		assertThat(((Number) JsonPath.read(body, "$.startAmount")).longValue()).isEqualTo(1_000_000);
		assertThat(((Number) JsonPath.read(body, "$.monthlyBudget")).longValue()).isEqualTo(500_000);
		assertThat((Object) JsonPath.read(body, "$.targetAmount")).isNull();
		assertThat((List<String>) JsonPath.read(body, "$.scenarios[*].id")).containsExactly("stable", "balanced", "active");
		// 상품 고르기: 개인이 가입할 수 있는 은행의 한도·제한 없는 적금(저축은행·기업 전용 제외), 이름 끝 200 중 5년치 자료가 있는 1위(KODEX 200), 우선주·신규 상장(SK스퀘어)을 뺀 코스피 5개
		assertThat((String) JsonPath.read(body, "$.products[0].items[0].name")).isEqualTo("누구나 적금");
		assertThat((String) JsonPath.read(body, "$.products[2].items[0].code")).isEqualTo("069500");
		assertThat((String) JsonPath.read(body, "$.products[3].items[0].code")).isEqualTo("360750");
		assertThat((List<String>) JsonPath.read(body, "$.products[4].items[*].code")).containsExactly("005930", "000660", "373220", "207940", "005380");
		assertThat((String) JsonPath.read(body, "$.scenarios[0].outcome.kind")).isEqualTo("FIXED");
		assertThat((String) JsonPath.read(body, "$.scenarios[1].outcome.kind")).isEqualTo("RANGE");
		for (int i = 0; i < 3; i++) {
			String at = "$.scenarios[" + i + "]";
			assertThat(((Number) JsonPath.read(body, at + ".monthly")).longValue()).isEqualTo(500_000);
			assertThat(((Number) JsonPath.read(body, at + ".paid")).longValue()).isEqualTo(1_000_000 + 500_000 * 36);
			// 금액 보존: 유형별 월 금액·시작 금액 몫의 합
			assertThat(((List<Number>) JsonPath.read(body, at + ".mix[*].monthly")).stream().mapToLong(Number::longValue).sum()).isEqualTo(500_000);
			assertThat(((List<Number>) JsonPath.read(body, at + ".mix[*].start")).stream().mapToLong(Number::longValue).sum()).isEqualTo(1_000_000);
			// 목표가 없으면 목표 달성 추정을 계산하지 않는다
			assertThat((Object) JsonPath.read(body, at + ".outcome.chanceBp")).isNull();
			// 그래프: 시작(0) ~ 기한 달, 각 점은 하위 ≤ 중간 ≤ 상위, 시작은 시작 금액, 마지막은 기한 말 결과
			List<Map<String, Number>> series = JsonPath.read(body, at + ".series");
			assertThat(series).hasSize(37);
			assertThat(series.getFirst().get("median").longValue()).isEqualTo(1_000_000);
			for (Map<String, Number> p : series) {
				assertThat(p.get("low").longValue()).isLessThanOrEqualTo(p.get("median").longValue());
				assertThat(p.get("median").longValue()).isLessThanOrEqualTo(p.get("high").longValue());
			}
			GoalScenarioDtos.Outcome o = outcome(body, at);
			long top = "FIXED".equals(o.kind()) ? o.fixedAmount() : o.high();
			assertThat(series.getLast().get("high").longValue()).isEqualTo(top);
			assertThat(o.highGain()).isEqualTo(top - (1_000_000 + 500_000L * 36));
			assertThat((String) JsonPath.read(body, at + ".resultText")).isEqualTo(ScenarioResultText.of(1_000_000, 500_000L, o, null, 36));
			assertThat((String) JsonPath.read(body, at + ".explanationParts.reason")).isNotBlank();
		}
	}

	@Test
	void 목표_금액을_넣으면_목표_달성_추정을_계산한다() throws Exception {
		String body = call(body(0, 500_000, 36, 20_000_000), 200);
		assertThat(((Number) JsonPath.read(body, "$.targetAmount")).longValue()).isEqualTo(20_000_000);
		// 확정형: 기한 말 금액이 목표 이상이면 10000, 아니면 0
		GoalScenarioDtos.Outcome fixed = outcome(body, "$.scenarios[0]");
		assertThat(fixed.chanceBp()).isEqualTo(fixed.fixedAmount() >= 20_000_000 ? 10000 : 0);
		for (int i = 0; i < 3; i++) {
			assertThat((Integer) JsonPath.read(body, "$.scenarios[" + i + "].outcome.chanceBp")).isBetween(0, 10000);
			assertThat((String) JsonPath.read(body, "$.scenarios[" + i + "].resultText")).contains("목표 2,000만 원");
		}
	}

	@Test
	void 같은_입력이면_같은_응답이다() throws Exception {
		String a = call(body(300_000, 400_000, 24), 200);
		String b = call(body(300_000, 400_000, 24), 200);
		// 저장용 resultId만 매번 다르다
		assertThat((String) JsonPath.read(a, "$.resultId")).isNotEqualTo(JsonPath.read(b, "$.resultId"));
		String id = "\"resultId\":\"[^\"]+\"";
		assertThat(a.replaceFirst(id, "")).isEqualTo(b.replaceFirst(id, ""));
	}

	@Test
	void 시작_금액의_적금_몫은_CMA로_계산하고_만기가_짧으면_남은_달도_CMA로_이어_간다() throws Exception {
		String body = call(body(1_000_000, 1_000_000, 18), 200);
		assertThat((Integer) JsonPath.read(body, "$.products[0].termMonths")).isEqualTo(12);
		assertThat((List<String>) JsonPath.read(body, "$.assumptions")).contains(GoalScenarioService.AFTER_MATURITY);
		// 안정(적금 70·CMA 30, 확정형): 적금 몫은 12개월 만기 뒤 6개월을 CMA로, 시작 금액 전부(적금 몫 70만 + CMA 몫 30만)와 CMA 월 몫은 18개월 CMA로
		long fixed = ((Number) JsonPath.read(body, "$.scenarios[0].outcome.fixedAmount")).longValue();
		long savingsPart = GoalScenarioService.savingsFinal(700_000, 18, 12, new BigDecimal("3.50"), false);
		long cmaPart = ScenarioMath.cma(1_000_000, 300_000, 18, GoalScenarioService.CMA_RATE).finalAmount();
		assertThat(fixed).isEqualTo(savingsPart + cmaPart);
		assertThat((List<Integer>) JsonPath.read(body, "$.scenarios[0].mix[*].start")).containsExactly(700_000, 300_000);
		// 확정형 그래프는 세 선이 같다
		List<Map<String, Number>> series = JsonPath.read(body, "$.scenarios[0].series");
		assertThat(series.getLast().get("low").longValue()).isEqualTo(fixed);
		assertThat(series.get(12).get("low").longValue()).isEqualTo(series.get(12).get("high").longValue());
	}

	@Test
	void 기한_60개월도_계산한다() throws Exception {
		String body = call(body(0, 300_000, 60), 200);
		assertThat((Integer) JsonPath.read(body, "$.months")).isEqualTo(60);
		assertThat((List<?>) JsonPath.read(body, "$.scenarios[1].series")).hasSize(61);
		assertThat((String) JsonPath.read(body, "$.scenarios[1].resultText")).contains("5년 뒤");
	}

	@Test
	void 입력이_범위를_벗어나면_400() throws Exception {
		record Case(String body, String field) {
		}
		for (Case c : List.of(new Case(body(0, 500_000, 61), "months"), new Case(body(0, 500_000, 5), "months"),
				new Case(body(-1, 500_000, 12), "startAmount"), new Case(body(1_000_000_001, 500_000, 12), "startAmount"),
				new Case(body(0, 9_000, 12), "monthlyBudget"), new Case(body(0, 10_001_000, 12), "monthlyBudget"),
				new Case(body(0, 500_500, 12), "monthlyBudget"), new Case(body(0, 500_000, 12, 999_999), "targetAmount"),
				new Case("{\"monthlyBudget\":500000,\"months\":12}", "startAmount"), new Case("{\"startAmount\":0,\"months\":12}", "monthlyBudget"))) {
			String out = call(c.body(), 400);
			assertThat((Object) JsonPath.read(out, "$.fields." + c.field())).as(c.body()).isNotNull();
		}
		// 경계값과 목표 null은 통과
		call(body(0, 10_000, 12), 200);
		call(body(1_000_000_000, 10_000_000, 12), 200);
		call("{\"startAmount\":0,\"monthlyBudget\":500000,\"months\":12,\"targetAmount\":null}", 200);
		// 예전 형식(목표 이름·목표 금액만)은 400
		call("{\"name\":\"목돈\",\"targetAmount\":15000000,\"months\":12}", 400);
	}

	@Test
	void 기한_이하_만기의_적금이_없으면_503() throws Exception {
		// 테스트 적금은 모두 만기 12개월이라 6개월 기한에는 넣을 적금이 없다
		String body = call(body(0, 500_000, 6), 503);
		assertThat((String) JsonPath.read(body, "$.field")).isEqualTo("SAVINGS");
	}

	@Test
	void 비회원은_미리_만든_조합이_있어도_데모() throws Exception {
		prepare(12, GOOD);
		String body = call(body(0, 500_000, 12), 200);
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("GUEST");
		assertThat((Object) JsonPath.read(body, "$.aiUsage")).isNull();
	}

	@Test
	void 미리_만든_조합이_없으면_데모이고_횟수를_차감하지_않는다() throws Exception {
		when(proposer.enabled()).thenReturn(true);
		when(proposer.planVersion()).thenReturn("goal-scenario-none");
		String body = member(body(0, 500_000, 12), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_PENDING");
		assertThat((Integer) JsonPath.read(body, "$.aiUsage.remainingToday")).isEqualTo(5);
	}

	@Test
	void 회원은_미리_만든_AI_조합을_위험_순으로_받고_요청_중에는_AI를_부르지_않는다() throws Exception {
		prepare(12, GOOD);
		String body = member(body(0, 500_000, 12), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.proposer")).isEqualTo("AI");
		assertThat((Object) JsonPath.read(body, "$.fallbackReason")).isNull();
		assertThat((List<String>) JsonPath.read(body, "$.scenarios[*].id")).containsExactly("stable", "balanced", "active");
		assertThat((List<String>) JsonPath.read(body, "$.scenarios[*].title")).containsExactly("안정", "균형", "적극");
		assertThat((Integer) JsonPath.read(body, "$.aiUsage.limitPerDay")).isEqualTo(5);
		assertThat((Integer) JsonPath.read(body, "$.aiUsage.remainingToday")).isEqualTo(4);
		verify(proposer, never()).proposePlan(any(), any());
	}

	@Test
	void 같은_조건으로_다시_보면_차감하지_않고_조건이_다르면_차감한다() throws Exception {
		prepare(12, GOOD);
		String token = signup();
		member(body(0, 500_000, 12), token, 200);
		String again = member(body(0, 500_000, 12), token, 200);
		assertThat((Boolean) JsonPath.read(again, "$.aiReused")).isTrue();
		assertThat((Integer) JsonPath.read(again, "$.aiUsage.remainingToday")).isEqualTo(4);
		String other = member(body(100_000, 500_000, 12), token, 200);
		assertThat((Boolean) JsonPath.read(other, "$.aiReused")).isFalse();
		assertThat((Integer) JsonPath.read(other, "$.aiUsage.remainingToday")).isEqualTo(3);
		String withTarget = member(body(0, 500_000, 12, 7_000_000), token, 200);
		assertThat((Boolean) JsonPath.read(withTarget, "$.aiReused")).isFalse();
		assertThat((Integer) JsonPath.read(withTarget, "$.aiUsage.remainingToday")).isEqualTo(2);
	}

	@Test
	void 하루_다섯_번을_넘기면_데모() throws Exception {
		prepare(12, GOOD);
		String token = signup();
		for (int i = 0; i < 5; i++) {
			member(body(0, 100_000 + i * 1_000L, 12), token, 200);
		}
		String over = member(body(0, 200_000, 12), token, 200);
		assertThat((String) JsonPath.read(over, "$.fallbackReason")).isEqualTo("LIMIT");
		assertThat((Integer) JsonPath.read(over, "$.aiUsage.remainingToday")).isZero();
	}

	@Test
	void 단계_범위를_어긴_조합은_쓰지_않는다() throws Exception {
		prepare(12, OFF_TIER);
		String body = member(body(0, 500_000, 12), signup(), 200);
		assertThat((String) JsonPath.read(body, "$.fallbackReason")).isEqualTo("AI_REJECTED");
		assertThat((Integer) JsonPath.read(body, "$.aiUsage.remainingToday")).isEqualTo(5);
	}

	@Test
	void 회원은_본_결과를_이름을_붙여_저장하고_지울_수_있다() throws Exception {
		String token = signup();
		String result = call(body(1_000_000, 500_000, 12, 7_000_000), 200);
		String resultId = JsonPath.read(result, "$.resultId");
		String saved = save(token, resultId, "balanced", "  여행 자금  ", 201);
		assertThat((String) JsonPath.read(saved, "$.name")).isEqualTo("여행 자금");
		assertThat((String) JsonPath.read(saved, "$.scenario.id")).isEqualTo("balanced");
		assertThat(((Number) JsonPath.read(saved, "$.startAmount")).longValue()).isEqualTo(1_000_000);
		assertThat(((Number) JsonPath.read(saved, "$.monthlyBudget")).longValue()).isEqualTo(500_000);
		assertThat(((Number) JsonPath.read(saved, "$.targetAmount")).longValue()).isEqualTo(7_000_000);
		assertThat((Object) JsonPath.read(saved, "$.scenario.outcome")).isEqualTo(JsonPath.read(result, "$.scenarios[1].outcome"));
		assertThat((Object) JsonPath.read(saved, "$.scenario.series")).isEqualTo(JsonPath.read(result, "$.scenarios[1].series"));
		assertThat((String) JsonPath.read(saved, "$.scenario.resultText")).isEqualTo(JsonPath.read(result, "$.scenarios[1].resultText"));
		assertThat((List<String>) JsonPath.read(saved, "$.alternatives[*].id")).containsExactly("stable", "active");
		long id = ((Number) JsonPath.read(saved, "$.id")).longValue();

		String list = send(auth(get("/api/v1/me/goal/scenarios"), token), 200);
		assertThat((List<?>) JsonPath.read(list, "$.items")).hasSize(1);
		assertThat((String) JsonPath.read(list, "$.items[0].title")).isEqualTo("나눠서 키우기");
		assertThat(((Number) JsonPath.read(list, "$.items[0].monthlyBudget")).longValue()).isEqualTo(500_000);
		assertThat(send(auth(get("/api/v1/me/goal/scenarios/" + id), token), 200)).isEqualTo(saved);

		// 다른 회원은 볼 수도 지울 수도 없다
		String other = signup();
		send(auth(get("/api/v1/me/goal/scenarios/" + id), other), 404);
		send(auth(delete("/api/v1/me/goal/scenarios/" + id), other), 404);
		send(auth(delete("/api/v1/me/goal/scenarios/" + id), token), 204);
		send(auth(get("/api/v1/me/goal/scenarios/" + id), token), 404);
	}

	@Test
	void 목표_없이_저장하면_목표가_null이다() throws Exception {
		String token = signup();
		String resultId = JsonPath.read(call(body(0, 500_000, 12), 200), "$.resultId");
		String saved = save(token, resultId, "stable", "비상금", 201);
		assertThat((Object) JsonPath.read(saved, "$.targetAmount")).isNull();
		String list = send(auth(get("/api/v1/me/goal/scenarios"), token), 200);
		assertThat((Object) JsonPath.read(list, "$.items[0].targetAmount")).isNull();
	}

	@Test
	void 옛_저장본은_시작_금액_0원과_그때의_필요_월_금액으로_읽는다() throws Exception {
		String token = signup();
		String resultId = JsonPath.read(call(body(0, 1_231_000, 12, 15_000_000), 200), "$.resultId");
		long id = ((Number) JsonPath.read(save(token, resultId, "stable", "목돈", 201), "$.id")).longValue();
		String snapshot = jdbc.queryForObject("select snapshot from goal_scenarios where id = ?", String.class, id);
		// #431 전 모양: version·시작 금액·목표 칸과 그래프·상위 10% 수익이 없고, 필요 월 금액·도달 여부·가능액 비교 칸이 있다
		String old = JsonPath.parse(snapshot).delete("$.version").delete("$.startAmount").delete("$.targetAmount").delete("$.scenario.series")
			.delete("$.scenario.outcome.highGain").delete("$.alternatives[*].series").delete("$.alternatives[*].outcome.highGain")
			.put("$", "reachShare", 0.8).put("$", "monthlyBudget", null).put("$.scenario", "reachable", true).put("$.scenario", "withinBudget", null)
			.delete("$.scenario.mix[*].start").jsonString();
		jdbc.update("update goal_scenarios set snapshot = ? format json where id = ?", old, id);
		String read = send(auth(get("/api/v1/me/goal/scenarios/" + id), token), 200);
		assertThat(((Number) JsonPath.read(read, "$.startAmount")).longValue()).isZero();
		assertThat(((Number) JsonPath.read(read, "$.monthlyBudget")).longValue()).isEqualTo(1_231_000);
		assertThat(((Number) JsonPath.read(read, "$.targetAmount")).longValue()).isEqualTo(15_000_000);
		assertThat((Object) JsonPath.read(read, "$.scenario.series")).isNull();
		GoalScenarioDtos.Outcome o = outcome(read, "$.scenario");
		assertThat(o.highGain()).isEqualTo(o.fixedAmount() - 1_231_000L * 12);
		assertThat((String) JsonPath.read(read, "$.scenario.resultText")).contains("목표 1,500만 원");
	}

	@Test
	void 다섯_개까지만_저장하고_이름이_없으면_400() throws Exception {
		String token = signup();
		String resultId = JsonPath.read(call(body(0, 500_000, 12), 200), "$.resultId");
		save(token, resultId, "stable", "   ", 400);
		save(token, resultId, "stable", "가나다라마바사아자차카타파하가나다라마바사", 400);
		for (int i = 0; i < 5; i++) {
			save(token, resultId, i % 2 == 0 ? "stable" : "active", "목돈 " + i, 201);
		}
		String over = save(token, resultId, "balanced", "목돈", 409);
		assertThat((String) JsonPath.read(over, "$.code")).isEqualTo("GOAL_SCENARIO_LIMIT");
	}

	@Test
	void 저장_오류() throws Exception {
		send(get("/api/v1/me/goal/scenarios"), 401);
		String token = signup();
		String expired = save(token, "no-such-result", "balanced", "목돈", 409);
		assertThat((String) JsonPath.read(expired, "$.code")).isEqualTo("GOAL_SCENARIO_EXPIRED");
		String resultId = JsonPath.read(call(body(0, 500_000, 12), 200), "$.resultId");
		save(token, resultId, "nope", "목돈", 400);
		save(token, "", "balanced", "목돈", 400);
		send(auth(get("/api/v1/me/goal/scenarios/999999"), token), 404);
	}

	@Test
	void 탈퇴하면_저장한_시나리오와_본_조합도_지운다() throws Exception {
		prepare(12, GOOD);
		String token = signup();
		String result = member(body(0, 510_000, 12), token, 200);
		long id = ((Number) JsonPath.read(save(token, JsonPath.read(result, "$.resultId"), "stable", "목돈", 201), "$.id")).longValue();
		assertThat(jdbc.queryForObject("select count(*) from goal_scenario_ai_cache where monthly_budget = ?", Integer.class, 510_000L)).isOne();
		int status = mvc.perform(auth(delete("/api/v1/me"), token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"password1\",\"confirm\":\"탈퇴\"}")).andReturn().getResponse().getStatus();
		assertThat(status).isEqualTo(204);
		assertThat(jdbc.queryForObject("select count(*) from goal_scenarios where id = ?", Integer.class, id)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from goal_scenario_ai_cache where monthly_budget = ?", Integer.class, 510_000L)).isZero();
		// 탈퇴한 회원의 토큰으로 보면 401
		member(body(0, 500_000, 12), token, 401);
	}

	@Test
	void 미리_만들기_호출은_서비스_전체_횟수만_센다() {
		java.util.function.Supplier<Integer> daily = () -> jdbc.query("select count from goal_scenario_ai_daily where usage_date = ?",
				rs -> rs.next() ? rs.getInt(1) : 0, quota.today());
		int before = daily.get();
		when(aiProps.dailyCap()).thenReturn(before + 1);
		assertThat(quota.reserveService()).isTrue();
		assertThat(quota.reserveService()).isFalse();
		assertThat(daily.get()).isEqualTo(before + 1);
	}

	@Test
	void 기한마다_미리_만들_조합의_대상은_기한과_통계만_담는다() {
		List<GoalScenarioService.PlanTarget> targets = service.planTargets();
		// 테스트 적금은 만기 12개월뿐이라 12~60개월
		assertThat(targets).extracting(GoalScenarioService.PlanTarget::months).first().isEqualTo(12);
		assertThat(targets).hasSize(49);
		GoalScenarioService.PlanTarget t18 = targets.stream().filter(t -> t.months() == 18).findFirst().orElseThrow();
		assertThat(t18.subject().input().months()).isEqualTo(18);
		assertThat(t18.subject().input().stats()).extracting(ScenarioProposer.TypeStat::type)
			.containsExactly("SAVINGS", "CMA", "KR_INDEX_ETF", "US_INDEX_ETF", "KOSPI_TOP5");
		assertThat(t18.subject().input().stats().getFirst().description()).contains("만기 12개월, 만기 뒤 남은 6개월은 CMA 예시 금리로 계산");
		assertThat(t18.roles()).hasSize(5);
		// 기한마다 지문이 다르다
		assertThat(targets.stream().map(t -> t.subject().fingerprint()).distinct().count()).isEqualTo(targets.size());
	}

	private static GoalScenarioDtos.Outcome outcome(String body, String at) {
		Map<String, Object> o = JsonPath.read(body, at + ".outcome");
		if (o == null) {
			return null;
		}
		java.util.function.Function<String, Long> n = k -> o.get(k) == null ? null : ((Number) o.get(k)).longValue();
		return new GoalScenarioDtos.Outcome((String) o.get("kind"), n.apply("fixedAmount"), n.apply("low"), n.apply("median"), n.apply("high"),
				n.apply("highGain"), o.get("chanceBp") == null ? null : ((Number) o.get("chanceBp")).intValue(), ((Number) o.get("lossBp")).intValue());
	}
}
