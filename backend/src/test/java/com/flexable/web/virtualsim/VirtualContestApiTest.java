package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;

import java.nio.charset.StandardCharsets;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.ZonedDateTime;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.UUID;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.http.HttpHeaders;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.request.MockHttpServletRequestBuilder;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.model.Request;
import com.atlassian.oai.validator.model.SimpleResponse;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.virtualsim.VirtualSimGenerator.Plan;
import com.jayway.jsonpath.JsonPath;

/**
 * 가상 시뮬레이션 대회 API(policies §8-8, decisions/2026-11-05-virtual-sim-contest). 시계를 옮겨 하루·주·월을 넘기고, 응답은 모두 계약(web-api.yaml)으로 검사한다.
 * 정리 작업은 끄고(job-enabled=false) 테스트가 tick()을 직접 부른다. 순서대로 같은 DB·같은 회원을 이어 쓴다.
 */
@SpringBootTest(properties = { "spring.datasource.url=jdbc:h2:mem:vcontest;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1",
		"app.virtual-sim.contest.job-enabled=false" })
@AutoConfigureMockMvc
@TestMethodOrder(MethodOrderer.OrderAnnotation.class)
class VirtualContestApiTest {

	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	// allOf(VirtualContestRoundSnapshot)를 한 스키마로 합쳐 검사한다(합치지 않으면 갈래마다 additionalProperties를 따로 봐서 실패한다)
	private static final OpenApiInteractionValidator VALIDATOR = OpenApiInteractionValidator.createForInlineApiSpecification(spec())
		.withResolveCombinators(true)
		.withLevelResolver(LevelResolver.create().withLevel("validation.schema.additionalProperties", ValidationReport.Level.ERROR).build())
		.build();

	/** 시계를 옮길 수 있게 둔다 */
	static final class MovableClock extends Clock {
		volatile Instant now = Instant.now();

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return Clock.fixed(now, zone);
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	static final MovableClock CLOCK = new MovableClock();

	@TestConfiguration
	static class Clocks {
		@Bean
		@Primary
		Clock movableClock() {
			return CLOCK;
		}
	}

	@Autowired
	MockMvc mvc;
	@Autowired
	VirtualSimStore store;
	@Autowired
	VirtualContestService contest;
	@Autowired
	VirtualSimService sim;
	@Autowired
	JdbcTemplate jdbc;

	private static boolean seeded;
	/** 회원 A(순서대로 이어 쓴다) */
	private static String a;

	private static String spec() {
		try {
			return Files.readString(Path.of("..", "docs", "contracts", "web-api.yaml"));
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private static void at(String kst) {
		CLOCK.now = ZonedDateTime.of(java.time.LocalDateTime.parse(kst), SEOUL).toInstant();
	}

	@BeforeEach
	void seed() {
		if (seeded) {
			return;
		}
		seeded = true;
		VirtualSimSample.companies().forEach(d -> store.saveCompany(d, VirtualSimSample.MODEL, VirtualSimSample.PROMPT_VERSION, VirtualSimChecker.VERSION,
				true, Instant.parse("2026-11-04T00:00:00Z")));
	}

	private MvcResult call(MockHttpServletRequestBuilder req, int expected) throws Exception {
		MvcResult r = mvc.perform(req).andReturn();
		var res = r.getResponse();
		String body = res.getContentAsString(StandardCharsets.UTF_8);
		String what = r.getRequest().getMethod() + " " + r.getRequest().getRequestURI();
		assertThat(res.getStatus()).as("%s → %s", what, body).isEqualTo(expected);
		SimpleResponse.Builder b = SimpleResponse.Builder.status(res.getStatus());
		if (res.getContentType() != null) {
			b.withContentType(res.getContentType());
		}
		if (!body.isEmpty()) {
			b.withBody(body);
		}
		ValidationReport report = VALIDATOR.validateResponse(r.getRequest().getRequestURI(), Request.Method.valueOf(r.getRequest().getMethod()), b.build());
		assertThat(report.getMessages().stream().filter(m -> m.getLevel() == ValidationReport.Level.ERROR).map(m -> m.getKey() + ": " + m.getMessage() + " " + m.getNestedMessages().stream().map(x -> x.getKey() + ": " + x.getMessage() + " " + x.getNestedMessages().stream().map(ValidationReport.Message::getMessage).toList()).toList()))
			.as("%s 응답이 계약과 달라요: %s", what, body)
			.isEmpty();
		return r;
	}

	private static String body(MvcResult r) throws Exception {
		return r.getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	private static MockHttpServletRequestBuilder json(MockHttpServletRequestBuilder req, String body) {
		return req.contentType(MediaType.APPLICATION_JSON).content(body);
	}

	private static MockHttpServletRequestBuilder auth(MockHttpServletRequestBuilder req, String token) {
		return req.header(HttpHeaders.AUTHORIZATION, "Bearer " + token);
	}

	/** 실제 시각으로 가입한다(토큰 만료는 실제 시계로 검사하므로) */
	private String signup() throws Exception {
		Instant saved = CLOCK.now;
		CLOCK.now = Instant.now();
		try {
			String email = "v" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
			MvcResult r = call(json(post("/api/v1/auth/signup"), "{\"email\":\"" + email + "\",\"password\":\"password1\",\"agreeTerms\":true}"), 201);
			return JsonPath.read(body(r), "$.accessToken");
		}
		finally {
			CLOCK.now = saved;
		}
	}

	/** 토큰(JWT)의 sub = 웹 회원 번호 */
	private static long userId(String token) {
		String payload = new String(java.util.Base64.getUrlDecoder().decode(token.split("\\.")[1]), StandardCharsets.UTF_8);
		return Long.parseLong(JsonPath.read(payload, "$.sub").toString());
	}

	private String round(String token, String startId, int expected) throws Exception {
		return body(call(auth(json(post("/api/v1/virtual-sim/contests/current/rounds"), "{\"startId\":\"" + startId + "\"}"), token), expected));
	}

	/**
	 * 풀 때 응답에 회사를 찾아낼 단서가 없는지: 회사명·날짜 칸이 없고, 제목·주요 내용에 회사명(예시 회사 이름)·날짜·절대 금액(네 자리 이상 숫자·천 단위 쉼표)·상대방 이름이 없다.
	 * 주요 내용에는 방향·경향·상승 비율 표현이 없다
	 */
	private static void assertNoLeak(String placement) {
		assertThat(placement).doesNotContain("\"company\"").doesNotContain("\"date\"").doesNotContain("receipt").doesNotContain("rcept");
		List<String> values = JsonPath.read(placement, "$.questions[*].details[*].value");
		List<String> labels = JsonPath.read(placement, "$.questions[*].details[*].label");
		List<String> titles = JsonPath.read(placement, "$.questions[*].title");
		// 예시 자료의 사건 글(body)은 예시 회사 이름을 쓰는 가상 글이라 보지 않는다(실제 공시는 body가 null)
		VirtualSimSample.companies().forEach(c -> assertThat(concat(concat(values, labels), titles)).noneMatch(t -> t.contains(c.name())));
		assertThat(values).isNotEmpty();
		assertThat(values).allSatisfy(v -> assertThat(v).doesNotContainPattern("\\d{4,}").doesNotContainPattern("\\d,\\d{3}").doesNotContainPattern("\\d+원")
			.doesNotContainPattern("\\d{1,2}월").doesNotContainPattern("\\d{1,2}일"));
		for (String t : concat(values, labels)) {
			assertThat(t).doesNotContain("오르").doesNotContain("오른").doesNotContain("내리").doesNotContain("내린").doesNotContain("상승").doesNotContain("하락")
				.doesNotContain("경향").doesNotContain("호재").doesNotContain("악재").doesNotContain("주식회사").doesNotContain("(주)").doesNotContain("㈜");
		}
	}

	private static List<String> concat(List<String> a, List<String> b) {
		List<String> out = new java.util.ArrayList<>(a);
		out.addAll(b);
		return out;
	}

	/** 문제마다 "오른다"로 낸 제출 본문 */
	private static String allUp(String placement) {
		String id = JsonPath.read(placement, "$.placementId");
		List<String> ids = JsonPath.read(placement, "$.questions[*].id");
		StringBuilder answers = new StringBuilder();
		for (String q : ids) {
			answers.append(answers.isEmpty() ? "" : ",").append("{\"questionId\":\"").append(q).append("\",\"prediction\":\"POSITIVE\"}");
		}
		return "{\"placementId\":\"" + id + "\",\"answers\":[" + answers + "]}";
	}

	/** 배치고사를 시작하고 모두 "오른다"로 낸다 */
	private String join(String token) throws Exception {
		String placement = body(call(auth(post("/api/v1/virtual-sim/contests/current/placement"), token), 200));
		return body(call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), allUp(placement)), token), 200));
	}

	private String mine(String token) throws Exception {
		return body(call(auth(get("/api/v1/me/virtual-sim/contests"), token), 200));
	}

	private static String command(String token, int version) {
		return "{\"sessionToken\":\"" + token + "\",\"commandId\":\"" + UUID.randomUUID() + "\",\"expectedVersion\":" + version + "}";
	}

	private Map<String, Object> roundRow(long id) {
		return jdbc.queryForMap("SELECT * FROM virtual_contest_rounds WHERE id = ?", id);
	}

	private long lastRoundId() {
		return jdbc.queryForObject("SELECT MAX(id) FROM virtual_contest_rounds", Long.class);
	}

	@Test
	@Order(1)
	void 회원만_배치고사로_참가() throws Exception {
		at("2026-11-10T10:00:00");
		String info = body(call(get("/api/v1/virtual-sim/contests/current"), 200));
		assertThat((String) JsonPath.read(info, "$.contestId")).isEqualTo("2026-11");
		assertThat((String) JsonPath.read(info, "$.startsAt")).isEqualTo("2026-11-01T00:00:00+09:00");
		assertThat((List<?>) JsonPath.read(info, "$.weeks")).hasSize(4);
		assertThat((String) JsonPath.read(info, "$.weeks[3].startsOn")).isEqualTo("2026-11-22");
		assertThat((String) JsonPath.read(info, "$.weeks[3].endsOn")).isEqualTo("2026-11-30");
		assertThat((List<Boolean>) JsonPath.read(info, "$.boards[*].available")).containsOnly(true);
		// 비회원은 401
		call(post("/api/v1/virtual-sim/contests/current/placement"), 401);
		call(json(post("/api/v1/virtual-sim/contests/current/rounds"), "{\"startId\":\"" + UUID.randomUUID() + "\"}"), 401);
		call(get("/api/v1/virtual-sim/contests/2026-11/boards/B10M/ranking"), 401);
		call(get("/api/v1/me/virtual-sim/contests"), 401);

		a = signup();
		String before = mine(a);
		assertThat((Object) JsonPath.read(before, "$.alias")).isNull();
		assertThat((Object) JsonPath.read(before, "$.current")).isNull();
		// 배치고사 전 판 시작은 409
		assertThat(round(a, UUID.randomUUID().toString(), 409)).contains("CONTEST_NOT_JOINED");

		String placement = body(call(auth(post("/api/v1/virtual-sim/contests/current/placement"), a), 200));
		// 풀 때는 정답·경향·회사명이 없다
		assertThat(placement).doesNotContain("trend").doesNotContain("upShare").doesNotContain("movement").doesNotContain("\"company\"");
		assertThat((List<?>) JsonPath.read(placement, "$.questions")).hasSize(10);
		// 새 배치고사는 공시 직후 기준이라고 알려 준다
		assertThat((String) JsonPath.read(placement, "$.basis")).isEqualTo("REACTION");
		String id = JsonPath.read(placement, "$.placementId");
		assertNoLeak(placement);
		// 공시 주요 내용: 구조화 자료가 있는 유형(예시 룰셋의 유상증자·자기주식 취득)은 항목이, 없는 유형(공급 계약·실적·배당)은 null
		List<Map<String, Object>> qs = JsonPath.read(placement, "$.questions");
		// 출제(Issue #388): 한 유형은 3문제까지, 예시 자료에 있는 근거 유형(공급 계약·자기주식 취득)은 1문제 이상
		Map<Object, Long> perType = qs.stream().collect(java.util.stream.Collectors.groupingBy(q -> q.get("category"), java.util.stream.Collectors.counting()));
		assertThat(perType.values()).allSatisfy(n -> assertThat(n).isLessThanOrEqualTo(VirtualContestQuestions.PER_TYPE_MAX));
		assertThat(perType).containsKeys("SUPPLY_CONTRACT", "BUYBACK_ACQUIRE");
		assertThat(qs).allSatisfy(q -> assertThat(q.get("details") != null).as(q.toString())
			.isEqualTo(Set.of("NEW_SHARES", "BUYBACK_ACQUIRE").contains((String) q.get("category"))));
		// 공시 AI 요약: 예시 자료는 주요 내용이 없는 유형(공급 계약·실적·배당)에 예시 요약을 싣고, 있는 유형은 null
		assertThat(qs).allSatisfy(q -> assertThat((String) q.get("summary")).as(q.toString())
			.isEqualTo(VirtualSimSample.summary(VirtualSimCategory.valueOf((String) q.get("category")))));
		// 채점 전 문제 사본에는 주요 내용과 요약이 있다
		String copy = jdbc.queryForObject("SELECT questions FROM virtual_contest_placements WHERE id = ?", String.class, id);
		assertThat(copy).contains("\"details\":[");
		qs.stream().map(q -> (String) q.get("summary")).filter(java.util.Objects::nonNull).forEach(t -> assertThat(copy).contains(t));
		// 진행 중이면 같은 문제를 다시 준다
		assertThat((String) JsonPath.read(body(call(auth(post("/api/v1/virtual-sim/contests/current/placement"), a), 200)), "$.placementId")).isEqualTo(id);
		// 문제 id가 맞지 않으면 400, 남의 배치고사·없는 배치고사는 404
		String bad = "{\"placementId\":\"" + id + "\",\"answers\":[" + String.join(",", java.util.Collections.nCopies(10,
				"{\"questionId\":\"q1\",\"prediction\":\"POSITIVE\"}")) + "]}";
		call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), bad), a), 400);
		call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), bad.replace(id, "nope")), a), 404);

		String result = join(a);
		// 모두 "오른다"로 냈으므로 맞힌 수 = 실제로 오른 공시 수. 결과에서 회사명을 공개한다
		int correct = JsonPath.read(result, "$.correct");
		List<String> moves = JsonPath.read(result, "$.items[*].movement");
		assertThat(correct).isEqualTo((int) moves.stream().filter("UP"::equals).count());
		assertThat((List<String>) JsonPath.read(result, "$.items[*].company")).allSatisfy(n -> assertThat(n).isNotBlank());
		// 반응 창 채점: 공시 직후·그다음 주 등락이 있고 5거래일 등락은 null. 정답 방향 = 공시 직후 등락의 부호
		List<Map<String, Object>> graded = JsonPath.read(result, "$.items");
		assertThat(graded).allSatisfy(it -> {
			assertThat(it.get("basis")).isEqualTo("REACTION");
			assertThat(it.get("subsequentReturnRate")).isNull();
			assertThat(it.get("nextWeekReturnRate")).isNotNull();
			assertThat(((Number) it.get("reactionReturnRate")).doubleValue() > 0).as(it.toString()).isEqualTo("UP".equals(it.get("movement")));
			// 유형 통계는 v3 룰셋의 공시 직후 통계라 채점 구간과 같아 싣는다. 경향은 고정 목록(근거 유형만 UP)
			assertThat(it.get("categoryUpShare")).as(it.toString()).isNotNull();
		});
		assertThat(graded).allSatisfy(it -> assertThat(it.get("trend")).isIn("UP", "MIXED"));
		String board = JsonPath.read(result, "$.board");
		assertThat(board).isEqualTo(VirtualContestRules.placementBoard(correct).name());
		assertThat(((Number) JsonPath.read(result, "$.entry.balance")).longValue()).isEqualTo(VirtualContestBoard.valueOf(board).seedMoney());
		// 같은 제출을 다시 보내도 처음 결과 그대로이고 참가는 한 번
		String again = body(call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), allUp(placement)), a), 200));
		assertThat((Integer) JsonPath.read(again, "$.correct")).isEqualTo(correct);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_entries WHERE user_id = ?", Integer.class, userId(a))).isEqualTo(1);
		// 채점하면 문제 사본은 주요 내용·요약까지 지우고, 결과에는 주요 내용·요약을 다시 남기지 않는다
		assertThat(jdbc.queryForObject("SELECT questions FROM virtual_contest_placements WHERE id = ?", String.class, id)).isNull();
		assertThat(jdbc.queryForObject("SELECT result FROM virtual_contest_placements WHERE id = ?", String.class, id)).doesNotContain("details").doesNotContain("label")
			.doesNotContain("summary");
		assertThat(result).doesNotContain("\"summary\"");
		// 다시 시작은 409
		assertThat(body(call(auth(post("/api/v1/virtual-sim/contests/current/placement"), a), 409))).contains("CONTEST_ALREADY_JOINED");

		String me = mine(a);
		assertThat((String) JsonPath.read(me, "$.alias")).matches("[가-힣]+[0-9]{4}");
		assertThat((String) JsonPath.read(me, "$.current.board")).isEqualTo(board);
		assertThat((Integer) JsonPath.read(me, "$.current.rank")).isEqualTo(1);
		assertThat((Integer) JsonPath.read(me, "$.current.today.roundsLeft")).isEqualTo(10);
		assertThat((Object) JsonPath.read(me, "$.current.today.startBalance")).isNull();
	}

	@Test
	@Order(2)
	void 판을_끝까지_하면_잔액을_한_번_바꾼다() throws Exception {
		at("2026-11-10T11:00:00");
		long before = ((Number) JsonPath.read(mine(a), "$.current.balance")).longValue();
		String startId = UUID.randomUUID().toString();
		String started = round(a, startId, 200);
		assertThat(started).doesNotContain("seed");
		assertThat((String) JsonPath.read(started, "$.snapshot.contest.contestId")).isEqualTo("2026-11");
		assertThat((Object) JsonPath.read(started, "$.snapshot.contest.endBalance")).isNull();
		assertThat(((Number) JsonPath.read(started, "$.snapshot.initialAmount")).longValue()).isEqualTo(before);
		assertThat(((Number) JsonPath.read(started, "$.round.startBalance")).longValue()).isEqualTo(before);
		assertThat((Integer) JsonPath.read(started, "$.round.roundsLeftToday")).isEqualTo(9);
		assertThat((String) JsonPath.read(started, "$.snapshot.notice")).isEqualTo(VirtualSimService.CONTEST_SAMPLE_NOTICE);
		String token = JsonPath.read(started, "$.sessionToken");
		// 같은 startId는 같은 판(하루 판 수에 세지 않는다)
		String resent = round(a, startId, 200);
		assertThat((String) JsonPath.read(resent, "$.sessionToken")).isEqualTo(token);
		assertThat((Integer) JsonPath.read(resent, "$.round.roundsLeftToday")).isEqualTo(9);
		// 진행 중에는 시작 잔액이 순위·내 기록에 쓰인다
		assertThat((Boolean) JsonPath.read(mine(a), "$.current.activeRound")).isTrue();

		int version = 0, asked = 0;
		String snapshot = started;
		while (true) {
			String step = command(token, version);
			snapshot = body(call(json(post("/api/v1/virtual-sim/step"), step), 200));
			// 같은 commandId 재전송은 같은 응답
			assertThat(body(call(json(post("/api/v1/virtual-sim/step"), step), 200))).isEqualTo(snapshot);
			version++;
			List<Map<String, Object>> decisions = JsonPath.read(snapshot, "$.decisions");
			assertThat(decisions).allSatisfy(d -> {
				assertThat(d.get("outcome")).isNull();
				assertThat(d.get("trendOutcome")).isNull();
			});
			if ("FINISHED".equals(JsonPath.read(snapshot, "$.status"))) {
				break;
			}
			String eventId = JsonPath.read(snapshot, "$.event.id");
			long maxBuy = ((Number) JsonPath.read(snapshot, "$.event.orderLimits.maxBuyShares")).longValue();
			String action = asked == 0 && maxBuy > 0 ? "BUY" : "HOLD";
			String decision = "{\"sessionToken\":\"" + token + "\",\"commandId\":\"" + UUID.randomUUID() + "\",\"expectedVersion\":" + version + ",\"eventId\":\""
					+ eventId + "\",\"action\":\"" + action + "\",\"quantity\":" + ("BUY".equals(action) ? maxBuy : 0) + "}";
			call(json(post("/api/v1/virtual-sim/decision"), decision), 200);
			call(json(post("/api/v1/virtual-sim/decision"), decision), 200);
			version++;
			asked++;
		}
		assertThat(asked).isEqualTo(VirtualContestRules.EVENTS);
		List<Map<String, Object>> decisions = JsonPath.read(snapshot, "$.decisions");
		assertThat(decisions).allSatisfy(d -> assertThat(d.get("movement")).isIn("UP", "DOWN", "FLAT"));
		long end = ((Number) JsonPath.read(snapshot, "$.contest.endBalance")).longValue();
		// 끝난 판은 유지만 했을 때 끝 잔액과 이번 판 초과 수익률을 함께 준다
		long hold = ((Number) JsonPath.read(snapshot, "$.contest.holdBalance")).longValue();
		assertThat(new java.math.BigDecimal(JsonPath.read(snapshot, "$.contest.excessRate").toString()))
			.isEqualByComparingTo(VirtualContestRules.excess(before, end, hold));
		assertThat(new java.math.BigDecimal(JsonPath.read(snapshot, "$.contest.holdReturnRate").toString()))
			.isEqualByComparingTo(VirtualContestRules.rate(hold, before));
		assertThat((Integer) JsonPath.read(snapshot, "$.totalDays")).isEqualTo(VirtualContestRules.ROUND_LENGTH);
		assertThat(end).isEqualTo(((Number) JsonPath.read(snapshot, "$.portfolio.total")).longValue());

		String me = mine(a);
		assertThat(((Number) JsonPath.read(me, "$.current.balance")).longValue()).isEqualTo(end);
		assertThat((Integer) JsonPath.read(me, "$.current.rounds")).isEqualTo(1);
		assertThat((Boolean) JsonPath.read(me, "$.current.activeRound")).isFalse();
		// 종료를 보내도 두 번 바뀌지 않는다
		call(json(post("/api/v1/virtual-sim/end"), "{\"sessionToken\":\"" + token + "\"}"), 204);
		me = mine(a);
		assertThat(((Number) JsonPath.read(me, "$.current.balance")).longValue()).isEqualTo(end);
		assertThat((Integer) JsonPath.read(me, "$.current.rounds")).isEqualTo(1);
		Map<String, Object> row = roundRow(lastRoundId());
		assertThat(row.get("end_reason")).isEqualTo("COMPLETED");
		assertThat(row.get("seed")).isNull();
		assertThat(row.get("orders")).isNull();
		// 끝난 판의 startId는 409
		assertThat(round(a, startId, 409)).contains("PRACTICE_CONFLICT");
	}

	@Test
	@Order(3)
	void 끊긴_판은_저장한_입력으로_같은_봉에서_정산한다() throws Exception {
		at("2026-11-10T12:00:00");
		String started = round(a, UUID.randomUUID().toString(), 200);
		String token = JsonPath.read(started, "$.sessionToken");
		String snapshot = body(call(json(post("/api/v1/virtual-sim/step"), command(token, 0)), 200));
		long qty = Math.min(3, ((Number) JsonPath.read(snapshot, "$.event.orderLimits.maxBuyShares")).longValue());
		call(json(post("/api/v1/virtual-sim/decision"), "{\"sessionToken\":\"" + token + "\",\"commandId\":\"" + UUID.randomUUID()
				+ "\",\"expectedVersion\":1,\"eventId\":\"ve1\",\"action\":\"" + (qty > 0 ? "BUY" : "HOLD") + "\",\"quantity\":" + qty + "}"), 200);
		snapshot = body(call(json(post("/api/v1/virtual-sim/step"), command(token, 2)), 200));

		long id = lastRoundId();
		Map<String, Object> row = roundRow(id);
		assertThat(row.get("generator")).isEqualTo(VirtualSimGenerator.VERSION);
		List<VirtualSimCategory> categories = Arrays.stream(((String) row.get("categories")).split(",")).map(VirtualSimCategory::valueOf).toList();
		VirtualContestBoard board = VirtualContestBoard.valueOf((String) row.get("board"));
		Plan plan = VirtualSimGenerator.generate((Long) row.get("seed"), VirtualSimSample.ruleset(), categories,
				((java.sql.Date) row.get("on_date")).toLocalDate(), board.rule((String) row.get("generator")));
		assertThat(plan.candles()).hasSize(VirtualContestRules.ROUND_LENGTH);
		// 저장한 입력으로 만든 봉은 사용자가 본 봉과 같다
		List<Map<String, Object>> seen = JsonPath.read(snapshot, "$.candles");
		for (int i = 0; i < seen.size(); i++) {
			assertThat(((Number) seen.get(i).get("close")).longValue()).isEqualTo(plan.candles().get(i).close());
			assertThat(((Number) seen.get(i).get("open")).longValue()).isEqualTo(plan.candles().get(i).open());
		}
		long start = (Long) row.get("start_balance");
		Map<Integer, VirtualContestRules.Order> fills = new HashMap<>();
		if (qty > 0) {
			fills.put(plan.events().getFirst().index() + 1, new VirtualContestRules.Order(Action.BUY, qty));
		}
		long expected = VirtualContestRules.play(plan.candles(), start, fills).total();

		// 서버 재시작: 메모리 세션이 사라진 뒤 정리 작업이 남은 사건을 유지로 끝까지 돌린다
		sim.dropContest(id);
		contest.tick();
		row = roundRow(id);
		assertThat(row.get("status")).isEqualTo("SETTLED");
		assertThat(row.get("end_reason")).isEqualTo("RESTARTED");
		assertThat((Long) row.get("end_balance")).isEqualTo(expected);
		assertThat(row.get("seed")).isNull();
		assertThat(((Number) JsonPath.read(mine(a), "$.current.balance")).longValue()).isEqualTo(expected);
		// 다시 돌려도 바뀌지 않는다
		contest.tick();
		assertThat((Integer) JsonPath.read(mine(a), "$.current.rounds")).isEqualTo(2);
		call(json(post("/api/v1/virtual-sim/state"), "{\"sessionToken\":\"" + token + "\"}"), 410);

		// 진행 중인 판이 있는데 새 판을 시작하면 이전 판을 먼저 정산한다
		round(a, UUID.randomUUID().toString(), 200);
		long replaced = lastRoundId();
		round(a, UUID.randomUUID().toString(), 200);
		assertThat(roundRow(replaced).get("end_reason")).isEqualTo("REPLACED");
	}

	@Test
	@Order(4)
	void 하루_10판까지() throws Exception {
		at("2026-11-10T13:00:00");
		int today = jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_rounds", Integer.class);
		String last = null;
		for (int i = today; i < VirtualContestRules.ROUNDS_PER_DAY; i++) {
			last = UUID.randomUUID().toString();
			round(a, last, 200);
		}
		String limited = round(a, UUID.randomUUID().toString(), 429);
		assertThat(limited).contains("CONTEST_DAILY_LIMIT");
		assertThat(((Number) JsonPath.read(limited, "$.retryAfterSeconds")).longValue()).isEqualTo(11 * 3600);
		// 같은 startId 재전송은 세지 않는다
		assertThat((Integer) JsonPath.read(round(a, last, 200), "$.round.roundsLeftToday")).isZero();
		assertThat((Integer) JsonPath.read(mine(a), "$.current.today.rounds")).isEqualTo(10);

		// 다음 날이면 다시 할 수 있고, 어제 하루 점수는 한 번 정한다
		at("2026-11-11T09:00:00");
		String next = round(a, UUID.randomUUID().toString(), 200);
		assertThat((Integer) JsonPath.read(next, "$.round.roundsLeftToday")).isEqualTo(9);
		long entry = jdbc.queryForObject("SELECT id FROM virtual_contest_entries WHERE user_id = ?", Long.class, userId(a));
		Map<String, Object> day = jdbc.queryForMap("SELECT * FROM virtual_contest_days WHERE entry_id = ? AND on_date = ?", entry, LocalDate.of(2026, 11, 10));
		long first = jdbc.queryForObject("SELECT start_balance FROM virtual_contest_rounds WHERE entry_id = ? AND on_date = ? ORDER BY id LIMIT 1", Long.class, entry,
				LocalDate.of(2026, 11, 10));
		long lastEnd = jdbc.queryForObject("SELECT end_balance FROM virtual_contest_rounds WHERE entry_id = ? AND on_date = ? ORDER BY ended_at DESC, id DESC LIMIT 1",
				Long.class, entry, LocalDate.of(2026, 11, 10));
		assertThat((Long) day.get("start_balance")).isEqualTo(first);
		assertThat((Long) day.get("end_balance")).isEqualTo(lastEnd);
		// 하루 점수는 그날 판들의 유지 대비 초과 수익률 평균으로 정한다(유지 끝 잔액은 정산 때 같은 봉으로 계산)
		List<java.math.BigDecimal> rates = jdbc.query("SELECT start_balance, end_balance, hold_balance FROM virtual_contest_rounds WHERE entry_id = ? AND on_date = ?",
				(rs, i) -> VirtualContestRules.excess(rs.getLong(1), rs.getLong(2), rs.getLong(3)), entry, LocalDate.of(2026, 11, 10));
		assertThat(rates).hasSize(10);
		assertThat((java.math.BigDecimal) day.get("return_rate")).isEqualByComparingTo(VirtualContestRules.dayRate(rates));
		assertThat(((Number) day.get("points")).intValue()).isEqualTo(VirtualContestRules.dailyPoints(VirtualContestRules.dayRate(rates), rates.size()));
		contest.tick();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_days WHERE entry_id = ? AND on_date = ?", Integer.class, entry,
				LocalDate.of(2026, 11, 10))).isEqualTo(1);
		// 내 기록에 최근 판(최신순)과 날짜별 하루 점수가 보인다
		String me = mine(a);
		assertThat((List<?>) JsonPath.read(me, "$.current.recentRounds")).hasSizeGreaterThanOrEqualTo(11);
		assertThat((String) JsonPath.read(me, "$.current.recentRounds[0].status")).isEqualTo("ACTIVE");
		assertThat((String) JsonPath.read(me, "$.current.recentRounds[1].date")).isEqualTo("2026-11-10");
		assertThat((Integer) JsonPath.read(me, "$.current.scoredDays[0].points")).isEqualTo(((Number) day.get("points")).intValue());
		assertThat((Integer) JsonPath.read(me, "$.current.scoredDays[0].rounds")).isEqualTo(10);
	}

	@Test
	@Order(5)
	void 주간_승급과_청산() throws Exception {
		at("2026-11-11T10:00:00");
		String d = signup();
		long user = userId(d);
		// 이전 형식(정답 방향 up 없음)으로 저장된 풀던 중인 배치고사는 지우고 새 문제로 시작한다
		java.sql.Timestamp now = java.sql.Timestamp.from(CLOCK.now);
		jdbc.update("INSERT INTO virtual_contest_placements (id, contest_id, user_id, questions, started_at, expires_at) VALUES ('legacy-1', '2026-11', ?, ?, ?, ?)", user,
				"[{\"id\":\"q1\",\"company\":\"해솔소재\",\"industry\":\"2차전지 소재\",\"category\":\"NEW_SHARES\",\"title\":\"t\",\"body\":\"b\",\"trend\":\"DOWN\",\"upShare\":0.4,\"downShare\":0.6,\"paths\":300}]",
				now, java.sql.Timestamp.from(CLOCK.now.plusSeconds(1800)));
		join(d);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_placements WHERE id = 'legacy-1'", Integer.class)).isZero();
		// 반응 창 규칙 전에 만든(basis 없는) 풀던 중인 배치고사는 시작할 때의 5거래일 기준으로 채점한다(decisions/2026-11-09-placement-reaction-window)
		String g = signup();
		StringBuilder five = new StringBuilder("[");
		for (int i = 1; i <= 10; i++) {
			five.append(i == 1 ? "" : ",").append("{\"id\":\"q").append(i)
				.append("\",\"company\":\"해솔소재\",\"industry\":\"2차전지 소재\",\"category\":\"NEW_SHARES\",\"title\":\"t\",\"body\":\"b\",\"date\":\"2025-03-04\",\"up\":")
				.append(i <= 3).append(",\"returnRate\":").append(i <= 3 ? "0.0123" : "-0.0045").append(",\"trend\":\"DOWN\",\"upShare\":0.4,\"downShare\":0.6,\"paths\":300}");
		}
		// 별명은 배치고사를 시작할 때 붙으므로 시작한 배치고사처럼 함께 넣는다
		jdbc.update("INSERT INTO virtual_contest_aliases (user_id, alias, version, created_at) VALUES (?, '느긋한수달0001', 'vsim-alias-v1', ?)", userId(g), now);
		jdbc.update("INSERT INTO virtual_contest_placements (id, contest_id, user_id, questions, started_at, expires_at) VALUES ('fiveday-1', '2026-11', ?, ?, ?, ?)",
				userId(g), five.append("]").toString(), now, java.sql.Timestamp.from(CLOCK.now.plusSeconds(1800)));
		// 다시 열면 5거래일 기준이라고 알려 화면이 맞는 기간을 안내한다
		assertThat((String) JsonPath.read(body(call(auth(post("/api/v1/virtual-sim/contests/current/placement"), g), 200)), "$.basis")).isEqualTo("FIVE_DAY");
		String fiveDay = join(g);
		assertThat((Integer) JsonPath.read(fiveDay, "$.correct")).isEqualTo(3);
		assertThat((List<String>) JsonPath.read(fiveDay, "$.items[*].basis")).containsOnly("FIVE_DAY");
		assertThat((List<Object>) JsonPath.read(fiveDay, "$.items[*].reactionReturnRate")).containsOnly((Object) null);
		assertThat(((Number) JsonPath.read(fiveDay, "$.items[0].subsequentReturnRate")).doubleValue()).isEqualTo(0.0123);
		// 5거래일 채점 문제의 유형 통계는 5거래일 통계라 그대로 싣는다
		assertThat((List<String>) JsonPath.read(fiveDay, "$.items[*].trend")).containsOnly("DOWN");
		// 11-10 전에 저장한 결과는 GradedItem 배열이다. 11-09 전에 채점해 basis 없이 저장된 결과도 5거래일 기준으로 돌려준다
		String stored = jdbc.queryForObject("SELECT result FROM virtual_contest_placements WHERE id = 'fiveday-1'", String.class);
		String legacy = stored.substring(stored.indexOf("\"items\":") + 8, stored.length() - 1);
		jdbc.update("UPDATE virtual_contest_placements SET result = ? WHERE id = 'fiveday-1'", legacy.replace("\"basis\":\"FIVE_DAY\",", ""));
		assertThat(jdbc.queryForObject("SELECT result FROM virtual_contest_placements WHERE id = 'fiveday-1'", String.class)).startsWith("[").doesNotContain("basis");
		String answers = "{\"placementId\":\"fiveday-1\",\"answers\":["
				+ String.join(",", java.util.stream.IntStream.rangeClosed(1, 10).mapToObj(i -> "{\"questionId\":\"q" + i + "\",\"prediction\":\"POSITIVE\"}").toList()) + "]}";
		String resent = body(call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), answers), g), 200));
		assertThat((List<String>) JsonPath.read(resent, "$.items[*].basis")).containsOnly("FIVE_DAY");
		assertThat((List<String>) JsonPath.read(resent, "$.items[*].trend")).containsOnly("DOWN");
		// 11-09~11-10에 반응 창으로 채점해 배열로 저장한 결과의 유형 통계는 5거래일 통계라 지운다(결과 화면이 공시 직후 통계로 읽지 않게)
		jdbc.update("UPDATE virtual_contest_placements SET result = ? WHERE id = 'fiveday-1'", legacy.replace("\"basis\":\"FIVE_DAY\"", "\"basis\":\"REACTION\""));
		String reactionLegacy = body(call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), answers), g), 200));
		assertThat((List<String>) JsonPath.read(reactionLegacy, "$.items[*].basis")).containsOnly("REACTION");
		assertThat((List<Object>) JsonPath.read(reactionLegacy, "$.items[*].trend")).containsOnly((Object) null);
		assertThat((List<Object>) JsonPath.read(reactionLegacy, "$.items[*].categoryUpShare")).containsOnly((Object) null);
		long entry = jdbc.queryForObject("SELECT id FROM virtual_contest_entries WHERE user_id = ?", Long.class, user);
		// 1일에 참가해 1~4일 하루 10판씩 유지보다 +6% 더 벌었다(5~7일은 판 없음): 1주 합 +400 → B10M에서 B50M으로 승급, 잔액은 새 판 시드머니
		Instant joined = ZonedDateTime.of(2026, 11, 1, 9, 0, 0, 0, SEOUL).toInstant();
		jdbc.update("UPDATE virtual_contest_entries SET board = 'B10M', highest_board = 'B10M', balance = 12624770, joined_at = ?, reached_at = ? WHERE id = ?",
				java.sql.Timestamp.from(joined), java.sql.Timestamp.from(joined), entry);
		long balance = 10_000_000;
		int number = 0;
		// 하루 점수는 그날 10판을 모두 시작한 날만 매긴다
		for (int day = 1; day <= 4; day++) for (int k = 0; k < VirtualContestRules.ROUNDS_FOR_SCORE; k++) {
			long end = balance * 106 / 100;
			Instant s = ZonedDateTime.of(2026, 11, day, 10, k, 0, 0, SEOUL).toInstant();
			number++;
			jdbc.update(
					"INSERT INTO virtual_contest_rounds (entry_id, start_id, round_number, board, generator, on_date, start_balance, end_balance, hold_balance, started_at, expires_at, ended_at, status, end_reason) VALUES (?, ?, ?, 'B10M', ?, ?, ?, ?, ?, ?, ?, ?, 'SETTLED', 'COMPLETED')",
					entry, UUID.randomUUID().toString(), number, VirtualSimGenerator.VERSION, LocalDate.of(2026, 11, day), balance, end, balance, java.sql.Timestamp.from(s),
					java.sql.Timestamp.from(s.plusSeconds(1800)), java.sql.Timestamp.from(s.plusSeconds(600)));
			balance = end;
		}
		contest.tick();
		String me = mine(d);
		assertThat((String) JsonPath.read(me, "$.current.board")).isEqualTo("B50M");
		assertThat(((Number) JsonPath.read(me, "$.current.balance")).longValue()).isEqualTo(50_000_000L);
		assertThat((Integer) JsonPath.read(me, "$.current.boardPoints")).isZero();
		assertThat((String) JsonPath.read(me, "$.current.lastBoardChange.from")).isEqualTo("B10M");
		assertThat((Integer) JsonPath.read(me, "$.current.lastBoardChange.weekPoints")).isEqualTo(4 * VirtualContestRules.DAY_POINTS);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_weeks WHERE entry_id = ?", Integer.class, entry)).isEqualTo(1);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_days WHERE entry_id = ?", Integer.class, entry)).isEqualTo(10);
		contest.tick();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_weeks WHERE entry_id = ?", Integer.class, entry)).isEqualTo(1);
		String ranking = body(call(auth(get("/api/v1/virtual-sim/contests/2026-11/boards/B50M/ranking"), d), 200));
		assertThat((String) JsonPath.read(ranking, "$.status")).isEqualTo("OPEN");
		assertThat((Boolean) JsonPath.read(ranking, "$.me.isMe")).isTrue();
		assertThat(ranking).doesNotContain("@example.com").doesNotContain("userId");
		call(auth(get("/api/v1/virtual-sim/contests/2026-11/boards/B10M/ranking"), d), 200);
		call(auth(get("/api/v1/virtual-sim/contests/2020-01/boards/B10M/ranking"), d), 404);

		// 청산되면 이번 시즌 판을 더 시작할 수 없다
		jdbc.update("UPDATE virtual_contest_entries SET liquidated = TRUE, balance = 999999 WHERE id = ?", entry);
		assertThat(round(d, UUID.randomUUID().toString(), 409)).contains("CONTEST_LIQUIDATED");
	}

	@Test
	@Order(6)
	void 마감과_월_정산() throws Exception {
		at("2026-11-30T23:50:00");
		String w = round(a, UUID.randomUUID().toString(), 200);
		String token = JsonPath.read(w, "$.sessionToken");
		String e = signup();
		String placement = body(call(auth(post("/api/v1/virtual-sim/contests/current/placement"), e), 200));
		String placementId = JsonPath.read(placement, "$.placementId");

		at("2026-12-01T00:05:00");
		// 마감 뒤 대회 판 진행·지난 대회 배치고사 제출은 409 CONTEST_CLOSED, 새 시즌은 배치고사부터
		assertThat(body(call(json(post("/api/v1/virtual-sim/step"), command(token, 0)), 409))).contains("CONTEST_CLOSED");
		StringBuilder answers = new StringBuilder();
		for (int i = 1; i <= 10; i++) {
			answers.append(i == 1 ? "" : ",").append("{\"questionId\":\"q").append(i).append("\",\"prediction\":null}");
		}
		assertThat(body(call(auth(json(post("/api/v1/virtual-sim/contests/current/placement/answers"), "{\"placementId\":\"" + placementId + "\",\"answers\":["
				+ answers + "]}"), e), 409))).contains("CONTEST_CLOSED");
		assertThat(round(a, UUID.randomUUID().toString(), 409)).contains("CONTEST_NOT_JOINED");

		// 4주차(22~29일) 하루 점수를 판정 기준에 닿게 바꿔 둔다: 1억 판이면 강등 쪽, 아니면 승급 쪽
		long entryA = jdbc.queryForObject("SELECT id FROM virtual_contest_entries WHERE user_id = ?", Long.class, userId(a));
		String boardA = jdbc.queryForObject("SELECT board FROM virtual_contest_entries WHERE id = ?", String.class, entryA);
		String highestA = jdbc.queryForObject("SELECT highest_board FROM virtual_contest_entries WHERE id = ?", String.class, entryA);
		int push = "B100M".equals(boardA) ? -VirtualContestRules.DAY_POINTS : VirtualContestRules.DAY_POINTS;
		assertThat(jdbc.update("UPDATE virtual_contest_days SET points = ? WHERE entry_id = ? AND on_date BETWEEN ? AND ?", push, entryA, LocalDate.of(2026, 11, 22),
				LocalDate.of(2026, 11, 29))).isEqualTo(8);

		contest.tick();
		assertThat(jdbc.queryForObject("SELECT status FROM virtual_contests WHERE id = '2026-11'", String.class)).isEqualTo("SETTLED");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_rounds WHERE status = 'ACTIVE'", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT end_reason FROM virtual_contest_rounds WHERE id = ?", String.class, lastRoundId())).isEqualTo("CLOSED");
		assertThat(jdbc.queryForObject("SELECT questions FROM virtual_contest_placements WHERE id = ?", String.class, placementId)).isNull();
		long entry = jdbc.queryForObject("SELECT id FROM virtual_contest_entries WHERE user_id = ?", Long.class, userId(a));
		// 마지막 날까지 하루 점수를 한 번씩 정하고, 마지막 날로 끝나는 4주차(22~30일)도 판정을 기록한다
		assertThat(jdbc.queryForObject("SELECT MAX(on_date) FROM virtual_contest_days WHERE entry_id = ?", LocalDate.class, entry)).isEqualTo(LocalDate.of(2026, 11, 30));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_days WHERE entry_id = ?", Integer.class, entry)).isEqualTo(21);
		assertThat(jdbc.queryForList("SELECT week FROM virtual_contest_weeks WHERE entry_id = ? ORDER BY week", Integer.class, entry)).containsExactly(2, 3, 4);
		// 4주차가 기준에 닿아도 판·잔액·최고 판은 그대로이고, 순위는 그 판에서 매긴다
		Map<String, Object> last = jdbc.queryForMap("SELECT points, from_board, to_board FROM virtual_contest_weeks WHERE entry_id = ? AND week = 4", entry);
		assertThat(last.get("from_board")).isEqualTo(boardA);
		assertThat(last.get("to_board")).isNotEqualTo(boardA);
		assertThat(jdbc.queryForObject("SELECT board FROM virtual_contest_entries WHERE id = ?", String.class, entry)).isEqualTo(boardA);
		assertThat(jdbc.queryForObject("SELECT highest_board FROM virtual_contest_entries WHERE id = ?", String.class, entry)).isEqualTo(highestA);

		List<Map<String, Object>> settled = jdbc.queryForList("SELECT id, board, balance, board_points, final_rank, final_participants FROM virtual_contest_entries ORDER BY id");
		assertThat(settled).allSatisfy(r -> assertThat(r.get("final_rank")).isNotNull());
		// 다시 돌려도 결과가 같다
		contest.settleContest("2026-11");
		contest.tick();
		assertThat(jdbc.queryForList("SELECT id, board, balance, board_points, final_rank, final_participants FROM virtual_contest_entries ORDER BY id"))
			.isEqualTo(settled);

		String ranking = body(call(auth(get("/api/v1/virtual-sim/contests/2026-11/boards/" + jdbc.queryForObject(
				"SELECT board FROM virtual_contest_entries WHERE id = ?", String.class, entry) + "/ranking"), a), 200));
		assertThat((String) JsonPath.read(ranking, "$.status")).isEqualTo("SETTLED");
		assertThat((Boolean) JsonPath.read(ranking, "$.me.isMe")).isTrue();
		String me = mine(a);
		assertThat((Object) JsonPath.read(me, "$.current")).isNull();
		assertThat((String) JsonPath.read(me, "$.history[0].contestId")).isEqualTo("2026-11");
		assertThat((String) JsonPath.read(me, "$.history[0].finalBoard")).isEqualTo(boardA);
		assertThat((String) JsonPath.read(me, "$.history[0].finalWeek.result")).isEqualTo(push > 0 ? "PROMOTE" : "DEMOTE");
		assertThat((Integer) JsonPath.read(me, "$.history[0].finalWeek.points")).isEqualTo(((Number) last.get("points")).intValue());
		assertThat((String) JsonPath.read(body(call(get("/api/v1/virtual-sim/contests/current"), 200)), "$.contestId")).isEqualTo("2026-12");

		// 탈퇴하면 대회 기록·별명을 모두 지운다
		String f = signup();
		join(f);
		round(f, UUID.randomUUID().toString(), 200);
		long fid = userId(f);
		call(auth(json(org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete("/api/v1/me"),
				"{\"password\":\"password1\",\"confirm\":\"탈퇴\"}"), f), 204);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_entries WHERE user_id = ?", Integer.class, fid)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_placements WHERE user_id = ?", Integer.class, fid)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_aliases WHERE user_id = ?", Integer.class, fid)).isZero();
		// 메모리에 남은 그 회원의 판 세션도 다음 정리 때 지운다
		contest.tick();
		assertThat(sim.contestRounds()).isEmpty();

		// 끝난 지 12개월이 지나면 지운다(별명은 회원인 동안 둔다)
		at("2027-12-01T00:10:00");
		contest.tick();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contests WHERE id = '2026-11'", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_entries", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_aliases WHERE user_id = ?", Integer.class, userId(a))).isEqualTo(1);
	}
}
