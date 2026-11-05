package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.market.PracticeMarketData.News;
import com.flexable.web.market.PracticeWindow;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Portfolio;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.practice.PracticeEngine;
import com.flexable.web.practice.PracticeEngine.Holding;
import com.flexable.web.virtualsim.VirtualSimChecker.Field;
import com.flexable.web.virtualsim.VirtualSimGenerator.Plan;
import com.flexable.web.virtualsim.VirtualSimGenerator.Planned;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §8 예시 표 = tests/policy/virtual-simulation.json. 표를 고치면 이 테스트가 규칙 코드와 맞는지 확인한다. */
class VirtualSimPolicyTest {

	private static JsonNode root() throws Exception {
		return read("virtual-simulation.json");
	}

	private static JsonNode read(String name) throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", name)));
	}

	private static List<Integer> ints(JsonNode n) {
		return n.valueStream().map(JsonNode::asInt).toList();
	}

	@Test
	void status_and_versions() throws Exception {
		JsonNode r = root();
		assertThat(r.get("status").asString()).isEqualTo("IMPLEMENTED");
		assertThat(r.get("versions").get("types").asString()).isEqualTo(VirtualSimCategory.TYPES_VERSION);
		assertThat(r.get("versions").get("ruleset").asString()).isEqualTo(VirtualSimRuleset.VERSION);
		assertThat(r.get("versions").get("check").asString()).isEqualTo(VirtualSimChecker.VERSION);
	}

	// ───────── 매매·평가·이번 결과: §5 그대로(practice.json) ─────────

	private static void assertPortfolio(Portfolio actual, JsonNode expected) {
		assertThat(actual.shares()).isEqualTo(expected.get("shares").asLong());
		assertThat(actual.cash()).isEqualTo(expected.get("cash").asLong());
		assertThat(actual.total()).isEqualTo(expected.get("total").asLong());
		assertThat(actual.profit()).isEqualTo(expected.get("profit").asLong());
		assertThat(actual.returnRate()).isEqualByComparingTo(new BigDecimal(expected.get("returnRate").asString()));
	}

	private static Portfolio play(long initial, JsonNode bars, List<JsonNode> expected) {
		var holding = new Holding(initial, 0);
		Portfolio value = null;
		int n = 0;
		for (JsonNode bar : bars) {
			String step = bar.get("actionBeforeBar").asString();
			holding = PracticeEngine.trade(holding, "START".equals(step) ? Action.BUY : Action.valueOf(step), bar.get("allocationPercent").asInt(),
					bar.get("open").asLong()).holding();
			value = PracticeEngine.value(holding, bar.get("close").asLong(), initial);
			if (expected != null) {
				assertPortfolio(value, expected.get(n++));
			}
		}
		return value;
	}

	@Test
	void trade_reuses_practice_cases() throws Exception {
		JsonNode keys = root().get("tradeAndQuiz").get("keys");
		JsonNode p = read(root().get("tradeAndQuiz").get("source").asString());
		assertThat(keys.valueStream().map(JsonNode::asString)).allMatch(k -> p.get(k) != null);
		JsonNode seq = p.get("tradeSequence");
		play(seq.get("initialAmount").asLong(), seq.get("bars"), seq.get("bars").valueStream().map(b -> b.get("expected")).toList());
		JsonNode neg = p.get("negativeRounding");
		assertPortfolio(play(neg.get("initialAmount").asLong(), neg.get("bars"), null), neg.get("expected"));
		JsonNode cash = p.get("insufficientCash");
		var holding = PracticeEngine.trade(new Holding(cash.get("initialAmount").asLong(), 0), Action.BUY, p.get("initialAllocationPercent").asInt(),
				cash.get("open").asLong()).holding();
		assertPortfolio(PracticeEngine.value(holding, cash.get("close").asLong(), cash.get("initialAmount").asLong()), cash.get("expected"));
	}

	@Test
	void window_constants() throws Exception {
		JsonNode w = root().get("window");
		assertThat(PracticeWindow.MIN_LENGTH).isEqualTo(w.get("minLength").asInt());
		assertThat(PracticeWindow.MAX_LENGTH).isEqualTo(w.get("maxLength").asInt());
		assertThat(VirtualSimGenerator.MIN_QUESTIONS).isEqualTo(w.get("minQuestions").asInt());
		assertThat(VirtualSimGenerator.MAX_QUESTIONS).isEqualTo(w.get("maxQuestions").asInt());
		assertThat(PracticeWindow.LEAD_DAYS).isEqualTo(w.get("leadDays").asInt());
		assertThat(PracticeWindow.FOLLOW_DAYS).isEqualTo(w.get("followDays").asInt());
	}

	// ───────── 8-1 날짜 ─────────

	@Test
	void dates() throws Exception {
		JsonNode d = root().get("dates");
		assertThat(VirtualSimGenerator.YEAR_OFFSET).isEqualTo(d.get("yearOffset").asInt());
		for (JsonNode c : d.get("baseYear")) {
			assertThat(VirtualSimGenerator.baseYear(LocalDate.parse(c.get("sessionDate").asString()))).isEqualTo(c.get("expected").asInt());
		}
		for (JsonNode c : d.get("startDate")) {
			LocalDate got = VirtualSimGenerator.startDate(LocalDate.parse(c.get("drawn").asString()));
			if (c.get("expected").isNull()) {
				assertThat(got).as(c.toString()).isNull();
			}
			else {
				assertThat(got).as(c.toString()).isEqualTo(LocalDate.parse(c.get("expected").asString()));
			}
		}
		for (JsonNode c : d.get("tradingDays")) {
			List<LocalDate> days = VirtualSimGenerator.tradingDays(LocalDate.parse(c.get("start").asString()), c.get("length").asInt());
			assertThat(days).hasSize(c.get("length").asInt());
			assertThat(days.getLast()).isEqualTo(LocalDate.parse(c.get("lastDate").asString()));
		}
	}

	// ───────── 8-2 사건 위치 ─────────

	@TestFactory
	Stream<DynamicTest> layout() throws Exception {
		return root().get("layout").get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.toString(), () -> {
			int length = c.get("length").asInt(), n = c.get("questions").asInt();
			assertThat(VirtualSimGenerator.slack(length, n)).isEqualTo(c.get("slack").asInt());
			int[] q = VirtualSimGenerator.layout(ints(c.get("draws")).stream().mapToInt(Integer::intValue).toArray());
			assertThat(q).containsExactly(ints(c.get("expected")).stream().mapToInt(Integer::intValue).toArray());
			assertAllAsked(length, q);
		}));
	}

	/** 만든 위치를 PracticeWindow.questions로 다시 세어도 모두 출제된다 */
	private static void assertAllAsked(int length, int[] positions) {
		List<LocalDate> days = VirtualSimGenerator.tradingDays(LocalDate.of(2036, 3, 17), length);
		List<Candle> candles = days.stream().map(d -> new Candle(d.toString(), 1000, 1000, 1000, 1000)).toList();
		List<News> news = new ArrayList<>();
		for (int i = 0; i < positions.length; i++) {
			news.add(new News("e" + i, "사건", days.get(positions[i]).toString(), "https://example.com", "가상"));
		}
		assertThat(PracticeWindow.questions(candles, news)).extracting(PracticeWindow.Question::index)
			.containsExactly(java.util.Arrays.stream(positions).boxed().toArray(Integer[]::new));
	}

	// ───────── 8-3 룰셋 ─────────

	@Test
	void ruleset_rules() throws Exception {
		JsonNode r = root().get("ruleset");
		for (JsonNode c : r.get("dailyReturnBp")) {
			assertThat(VirtualSimRules.returnBp(c.get("prev").asLong(), c.get("close").asLong())).as(c.toString()).isEqualTo(c.get("expected").asInt());
		}
		for (JsonNode c : r.get("classification")) {
			VirtualSimCategory got = VirtualSimCategory.classify(c.get("title").asString());
			assertThat(got == null ? null : got.name()).as(c.toString()).isEqualTo(c.get("expected").isNull() ? null : c.get("expected").asString());
		}
		JsonNode e = r.get("eventPaths");
		List<LocalDate> dates = e.get("dates").valueStream().map(x -> LocalDate.parse(x.asString())).toList();
		List<Long> closes = e.get("closes").valueStream().map(JsonNode::asLong).toList();
		for (JsonNode c : e.get("cases")) {
			int[] path = VirtualSimRules.path(closes, VirtualSimRules.baseIndex(dates, LocalDate.parse(c.get("publishedDate").asString())));
			if (c.get("expected").isNull()) {
				assertThat(path).as(c.toString()).isNull();
			}
			else {
				assertThat(path).as(c.toString()).containsExactly(ints(c.get("expected")).stream().mapToInt(Integer::intValue).toArray());
			}
		}
		assertThat(VirtualSimRules.MIN_PATHS).isEqualTo(r.get("minPathsPerType").asInt());
		assertThat(VirtualSimRules.MAX_PATHS).isEqualTo(r.get("maxPathsPerType").asInt());
		assertThat(VirtualSimRules.MIN_TYPES).isEqualTo(r.get("minTypes").asInt());
		assertThat(VirtualSimRules.MIN_CLEAR_TYPES).isEqualTo(r.get("minClearTypes").asInt());
		for (JsonNode c : r.get("upShare")) {
			assertThat(VirtualSimRules.upShare(c.get("paths").asInt(), c.get("up").asInt())).as(c.toString())
				.isEqualByComparingTo(new BigDecimal(c.get("expected").asString()));
		}
		Map<String, int[]> returns = new HashMap<>();
		for (JsonNode c : r.get("volatilityGrade").get("instruments")) {
			returns.put(c.get("code").asString(), ints(c.get("returnsBp")).stream().mapToInt(Integer::intValue).toArray());
		}
		Map<String, Integer> grades = VirtualSimRules.grades(returns);
		for (JsonNode c : r.get("volatilityGrade").get("instruments")) {
			assertThat(grades.get(c.get("code").asString())).as(c.toString()).isEqualTo(c.get("expected").asInt());
		}
		JsonNode q = r.get("quantile");
		int[] table = VirtualSimRules.quantiles(ints(q.get("values")).stream().mapToInt(Integer::intValue).toArray());
		assertThat(table).hasSize(q.get("size").asInt());
		q.get("expected").properties().forEach(x -> assertThat(table[Integer.parseInt(x.getKey())]).as(x.getKey()).isEqualTo(x.getValue().asInt()));
	}

	@Test
	void thin_keeps_every_floor_j_n_over_500() {
		List<Integer> all = new ArrayList<>();
		for (int i = 0; i < 1234; i++) {
			all.add(i);
		}
		List<Integer> kept = VirtualSimRules.thin(all);
		assertThat(kept).hasSize(500);
		assertThat(kept.get(0)).isEqualTo(0);
		assertThat(kept.get(1)).isEqualTo(2); // floor(1 × 1234 / 500)
		assertThat(kept.get(499)).isEqualTo(1231); // floor(499 × 1234 / 500)
		assertThat(VirtualSimRules.thin(all.subList(0, 30))).hasSize(30);
	}

	// ───────── 8-4 봉 만들기 ─────────

	@TestFactory
	Stream<DynamicTest> bars() throws Exception {
		JsonNode o = root().get("ohlc");
		assertThat(VirtualSimGenerator.MIN_START_PRICE).isEqualTo(o.get("startPrice").get("min").asLong());
		assertThat(VirtualSimGenerator.MAX_START_PRICE).isEqualTo(o.get("startPrice").get("max").asLong());
		assertThat(VirtualSimGenerator.PRICE_STEP).isEqualTo(o.get("startPrice").get("step").asLong());
		assertThat(VirtualSimGenerator.LIMIT_BP).isEqualTo(o.get("limitBp").asLong());
		return o.get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.toString(), () -> {
			Candle bar = VirtualSimGenerator.bar("2036-03-17", c.get("prevClose").asLong(), c.get("r").asInt(), c.get("g").asInt(), c.get("u").asInt(),
					c.get("d").asInt());
			JsonNode e = c.get("expected");
			assertThat(bar).isEqualTo(new Candle("2036-03-17", e.get("open").asLong(), e.get("high").asLong(), e.get("low").asLong(), e.get("close").asLong()));
		}));
	}

	// ───────── 8-6 경향과 판정 뒤 정보 ─────────

	@Test
	void trend() throws Exception {
		JsonNode t = root().get("trend");
		assertThat(VirtualSimRules.UP_AT_LEAST).isEqualByComparingTo(new BigDecimal(t.get("upAtLeast").asString()));
		assertThat(VirtualSimRules.DOWN_AT_MOST).isEqualByComparingTo(new BigDecimal(t.get("downAtMost").asString()));
		assertThat(VirtualSimRules.TREND_MIN_PATHS).isEqualTo(t.get("minPaths").asInt());
		for (JsonNode c : t.get("cases")) {
			BigDecimal share = VirtualSimRules.upShare(c.get("paths").asInt(), c.get("up").asInt());
			assertThat(share).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("upShare").asString()));
			assertThat(VirtualSimRules.trend(c.get("paths").asInt(), share)).as(c.toString()).isEqualTo(c.get("expected").asString());
		}
	}

	/** 일반 세션도 채점하지 않는다(11-05, #253): 예시의 outcome·trendOutcome은 null이고 movement만 정한다. 세션 응답은 VirtualSimServiceTest가 본다 */
	@Test
	void no_score() throws Exception {
		JsonNode n = root().get("noScore");
		for (JsonNode c : n.get("cases")) {
			long base = c.get("baseline").asLong(), after = c.get("afterFiveSessions").asLong();
			assertThat(c.get("trendOutcome").isNull()).as(c.toString()).isTrue();
			assertThat(c.get("outcome").isNull()).as(c.toString()).isTrue();
			assertThat(VirtualSimService.movement(base, after)).as(c.toString()).isEqualTo(c.get("movement").asString());
		}
	}

	// ───────── 8-7 매매(수량 직접 입력) ─────────

	@Test
	void order_by_quantity() throws Exception {
		JsonNode o = root().get("order");
		o.get("predictionByAction").properties().forEach(x -> {
			Prediction p = VirtualSimService.prediction(Action.valueOf(x.getKey()));
			assertThat(p == null ? null : p.name()).isEqualTo(x.getValue().isNull() ? null : x.getValue().asString());
		});
		for (JsonNode c : o.get("cases")) {
			var holding = new Holding(c.get("cash").asLong(), c.get("shares").asLong());
			var limits = VirtualSimService.limits(holding, c.get("referencePrice").asLong());
			assertThat(limits.maxBuyShares()).as(c.toString()).isEqualTo(c.get("limits").get("maxBuyShares").asLong());
			assertThat(limits.maxSellShares()).as(c.toString()).isEqualTo(c.get("limits").get("maxSellShares").asLong());
			Action action = Action.valueOf(c.get("action").asString());
			long q = c.get("quantity").asLong();
			boolean valid = action == Action.HOLD ? q == 0 : q >= 1 && q <= (action == Action.BUY ? limits.maxBuyShares() : limits.maxSellShares());
			JsonNode e = c.get("expected");
			if (e.isString()) {
				assertThat(valid).as(c.toString()).isFalse();
				continue;
			}
			assertThat(valid).as(c.toString()).isTrue();
			var trade = VirtualSimService.trade(holding, action, q, c.get("nextOpen").asLong());
			assertThat(trade.shares()).as(c.toString()).isEqualTo(e.get("executedShares").asLong());
			assertThat(trade.holding()).as(c.toString()).isEqualTo(new Holding(e.get("cash").asLong(), e.get("shares").asLong()));
		}
	}

	// ───────── 생성 성질(예시 룰셋, 시드 여러 개) ─────────

	@Test
	void sample_ruleset_has_five_types_three_clear() {
		VirtualSimRuleset rules = VirtualSimSample.ruleset();
		assertThat(rules.isSample()).isTrue();
		assertThat(rules.categories()).hasSize(5);
		assertThat(rules.categories().stream().filter(CategoryStats::clear)).hasSize(3);
		assertThat(rules.grades()).hasSize(3).allSatisfy(g -> {
			assertThat(g.r()).hasSize(VirtualSimRules.QUANTILES);
			assertThat(java.util.Arrays.stream(g.u()).min().orElse(0)).isGreaterThanOrEqualTo(0);
			assertThat(java.util.Arrays.stream(g.d()).min().orElse(0)).isGreaterThanOrEqualTo(0);
		});
	}

	@Test
	void generation_properties() {
		VirtualSimRuleset rules = VirtualSimSample.ruleset();
		Set<VirtualSimCategory> available = rules.categories().stream().map(CategoryStats::category).collect(java.util.stream.Collectors.toSet());
		Set<Integer> lengths = new HashSet<>(), counts = new HashSet<>();
		for (long seed = 1; seed <= 300; seed++) {
			LocalDate session = LocalDate.of(2026, 11, 4).plusDays(seed * 7);
			Plan plan = VirtualSimGenerator.generate(seed, rules, available, session);
			assertThat(VirtualSimGenerator.generate(seed, rules, available, session)).usingRecursiveComparison().isEqualTo(plan);
			List<Candle> c = plan.candles();
			lengths.add(c.size());
			counts.add(plan.events().size());
			assertThat(c.size()).isBetween(120, 250);
			assertThat(LocalDate.parse(c.getFirst().date()).getYear()).isEqualTo(session.getYear() + 10);
			long prev = -1;
			LocalDate prevDate = null;
			for (Candle bar : c) {
				assertThat(bar.valid()).as(bar.toString()).isTrue();
				assertThat(bar.low()).isGreaterThanOrEqualTo(1);
				LocalDate d = LocalDate.parse(bar.date());
				assertThat(d.getDayOfWeek()).isNotIn(DayOfWeek.SATURDAY, DayOfWeek.SUNDAY);
				if (prevDate != null) {
					assertThat(VirtualSimGenerator.tradingDays(prevDate, 2).get(1)).isEqualTo(d);
					long upper = Math.floorDiv(prev * 13_000, 10_000L), lower = Math.max(1, -Math.floorDiv(-prev * 7_000, 10_000L));
					assertThat(bar.high()).isLessThanOrEqualTo(upper);
					assertThat(bar.low()).isGreaterThanOrEqualTo(lower);
				}
				prev = bar.close();
				prevDate = d;
			}
			List<Planned> events = plan.events();
			assertThat(events.size()).isBetween(3, 5);
			assertThat(events.stream().map(Planned::category).distinct()).hasSize(events.size());
			assertAllAsked(c.size(), events.stream().mapToInt(Planned::index).toArray());
			// 사건 뒤 1~5번째 봉의 종가는 그 유형에서 뽑은 경로 값으로 만든 것이다
			for (Planned e : events) {
				assertThat(rules.stats(e.category()).orElseThrow().samples()).anyMatch(s -> java.util.Arrays.equals(s, e.path()));
				assertThat(e.category().titles()).contains(e.title());
				for (int k = 1; k <= 5; k++) {
					long p = c.get(e.index() + k - 1).close();
					long expected = Math.floorDiv(p * (10_000L + e.path()[k - 1]), 10_000L);
					long upper = Math.floorDiv(p * 13_000, 10_000L), lower = Math.max(1, -Math.floorDiv(-p * 7_000, 10_000L));
					assertThat(c.get(e.index() + k).close()).isEqualTo(Math.max(lower, Math.min(upper, expected)));
				}
			}
		}
		assertThat(counts).contains(3, 4, 5);
		assertThat(lengths.size()).isGreaterThan(50);
	}

	// ───────── 8-5 자동 검사 ─────────

	@TestFactory
	Stream<DynamicTest> checks() throws Exception {
		JsonNode c = root().get("checks");
		assertThat(c.get("order").valueStream().map(JsonNode::asString).toList())
			.containsExactlyElementsOf(Stream.of(VirtualSimChecker.Reason.values()).filter(r -> r != VirtualSimChecker.Reason.PASS).map(Enum::name).toList());
		VirtualSimChecker checker = new VirtualSimChecker(c.get("listedNames").valueStream().map(JsonNode::asString).toList(), List.of());
		return c.get("cases").valueStream().map(x -> DynamicTest.dynamicTest(x.get("text").asString(), () -> {
			Field field = Field.valueOf(x.get("field").asString().toUpperCase());
			VirtualSimCategory type = x.has("type") ? VirtualSimCategory.valueOf(x.get("type").asString()) : null;
			assertThat(checker.check(field, x.get("text").asString(), type).name()).isEqualTo(x.get("expected").asString());
		}));
	}

	@Test
	void sample_companies_pass_checks() {
		VirtualSimChecker checker = new VirtualSimChecker(List.of("삼성전자", "SK하이닉스", "NAVER", "KB금융", "알테오젠", "에코프로", "KODEX 200"), List.of());
		for (var d : VirtualSimSample.companies()) {
			assertThat(checker.check(Field.NAME, d.name())).as(d.name()).isEqualTo(VirtualSimChecker.Reason.PASS);
			assertThat(checker.check(Field.INTRO, d.intro())).as(d.intro()).isEqualTo(VirtualSimChecker.Reason.PASS);
			d.bodies().forEach((type, body) -> assertThat(checker.check(Field.BODY, body, type)).as(body).isEqualTo(VirtualSimChecker.Reason.PASS));
		}
	}

	@Test
	void duplicate_names_are_rejected() {
		VirtualSimChecker checker = new VirtualSimChecker(List.of(), List.of("해솔소재"));
		assertThat(checker.check(Field.NAME, "해솔소재")).isEqualTo(VirtualSimChecker.Reason.REAL_COMPANY);
		assertThat(checker.check(Field.NAME, "다온바이오")).isEqualTo(VirtualSimChecker.Reason.PASS);
		checker.reserve("다온바이오");
		assertThat(checker.check(Field.NAME, "다온바이오")).isEqualTo(VirtualSimChecker.Reason.REAL_COMPANY);
	}
}
