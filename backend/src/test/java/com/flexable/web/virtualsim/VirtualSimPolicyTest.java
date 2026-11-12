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
			int base = VirtualSimRules.baseIndex(dates, LocalDate.parse(c.get("publishedDate").asString()));
			int[] path = VirtualSimRules.path(closes, base);
			if (c.get("expected").isNull()) {
				assertThat(path).as(c.toString()).isNull();
			}
			else {
				assertThat(path).as(c.toString()).containsExactly(ints(c.get("expected")).stream().mapToInt(Integer::intValue).toArray());
				assertThat(closes.get(base + 1) > closes.get(base - 1)).as(c.toString()).isEqualTo(c.get("reactionUp").asBoolean());
			}
		}
		for (JsonNode c : r.get("corrections").get("cases")) {
			assertThat(VirtualContestQuestions.correction(c.get("title").asString())).as(c.toString()).isEqualTo(c.get("correction").asBoolean());
		}
		assertThat(VirtualSimRules.MIN_PATHS).isEqualTo(r.get("minPathsPerType").asInt());
		assertThat(VirtualSimRules.MAX_PATHS).isEqualTo(r.get("maxPathsPerType").asInt());
		assertThat(VirtualSimRules.MIN_TYPES).isEqualTo(r.get("minTypes").asInt());
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
		Map<VirtualSimCategory, String> fixed = new HashMap<>();
		t.get("fixed").properties().forEach(x -> fixed.put(VirtualSimCategory.valueOf(x.getKey()), x.getValue().asString()));
		assertThat(VirtualSimRules.TRENDS).isEqualTo(fixed);
		// 고정 목록은 배치고사의 반응 창 근거 유형과 같다
		assertThat(VirtualSimRules.TRENDS.keySet()).isEqualTo(VirtualContestQuestions.EVIDENCE_TYPES);
		for (VirtualSimCategory c : VirtualSimCategory.values()) {
			assertThat(VirtualSimRules.trend(c)).as(c.name()).isEqualTo(fixed.getOrDefault(c, t.get("others").asString()));
		}
		for (JsonNode c : t.get("cases")) {
			assertThat(VirtualSimRules.trend(VirtualSimCategory.valueOf(c.get("category").asString()))).as(c.toString()).isEqualTo(c.get("expected").asString());
		}
	}

	/** 일반 세션도 채점하지 않는다(11-05, #253): 예시의 outcome·trendOutcome은 null이고 movement만 정한다. 세션 응답은 VirtualSimServiceTest가 본다 */
	@Test
	void no_score() throws Exception {
		JsonNode n = root().get("noScore");
		for (JsonNode c : n.get("cases")) {
			long prev = c.get("prevClose").asLong(), next = c.get("nextClose").asLong(), after = c.get("afterClose").asLong();
			assertThat(c.get("trendOutcome").isNull()).as(c.toString()).isTrue();
			assertThat(c.get("outcome").isNull()).as(c.toString()).isTrue();
			assertThat(VirtualSimService.movement(prev, next)).as(c.toString()).isEqualTo(c.get("movement").asString());
			assertThat(PracticeEngine.rate(next - prev, prev)).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("reactionReturnRate").asString()));
			assertThat(PracticeEngine.rate(after - next, next)).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("nextWeekReturnRate").asString()));
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
			// 평단가는 이 표의 대상이 아니라 보유가 있으면 기준 가격으로 둔다(평단가 예시는 practice.json averagePrice.byQuantity)
			long held = c.get("shares").asLong();
			var holding = new Holding(c.get("cash").asLong(), held, held == 0 ? null : c.get("referencePrice").asLong());
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
			assertThat(trade.holding().cash()).as(c.toString()).isEqualTo(e.get("cash").asLong());
			assertThat(trade.holding().shares()).as(c.toString()).isEqualTo(e.get("shares").asLong());
		}
	}

	/** 평단가(policies §5 "평단가"): 수량 입력 매매. 정본은 practice.json averagePrice.byQuantity */
	@Test
	void average_price_by_quantity() throws Exception {
		JsonNode c = JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "practice.json")))
				.get("averagePrice").get("byQuantity");
		Holding holding = new Holding(c.get("initialAmount").asLong(), 0);
		for (JsonNode bar : c.get("bars")) {
			long open = bar.get("open").asLong();
			var trade = "START".equals(bar.get("actionBeforeBar").asString())
					? PracticeEngine.trade(holding, Action.BUY, 50, open)
					: VirtualSimService.trade(holding, Action.valueOf(bar.get("actionBeforeBar").asString()), bar.get("quantity").asLong(), open);
			holding = trade.holding();
			JsonNode e = bar.get("expected");
			assertThat(trade.shares()).as(bar.toString()).isEqualTo(e.get("executedShares").asLong());
			assertThat(holding.shares()).as(bar.toString()).isEqualTo(e.get("shares").asLong());
			assertThat(holding.cash()).as(bar.toString()).isEqualTo(e.get("cash").asLong());
			assertThat(holding.averagePrice()).as(bar.toString()).isEqualTo(e.get("averagePrice").isNull() ? null : e.get("averagePrice").asLong());
			assertThat(PracticeEngine.value(holding, open, c.get("initialAmount").asLong()).averagePrice()).isEqualTo(holding.averagePrice());
		}
	}

	// ───────── 8-9 레버리지 판 ─────────

	private static Candle candle(String date, JsonNode c) {
		return new Candle(date, c.get("open").asLong(), c.get("high").asLong(), c.get("low").asLong(), c.get("close").asLong());
	}

	@Test
	void leverage_prices_and_paths() throws Exception {
		JsonNode l = root().get("leverage");
		assertThat(ints(l.get("allowed"))).containsExactly(VirtualSimLeverage.MIN, 2, VirtualSimLeverage.MAX);
		assertThat(new VirtualSimDtos.Start(java.util.UUID.randomUUID(), new BigDecimal("1000000")).multiple()).isEqualTo(l.get("default").asInt());
		for (JsonNode c : l.get("prices")) {
			assertThat(VirtualSimLeverage.price(c.get("prevLeveraged").asLong(), c.get("prevBase").asLong(), c.get("base").asLong(), c.get("k").asInt()))
				.as(c.toString()).isEqualTo(c.get("expected").asLong());
		}
		for (JsonNode c : l.get("paths")) {
			List<Candle> base = new ArrayList<>(), expected = new ArrayList<>();
			for (int i = 0; i < c.get("base").size(); i++) {
				String date = LocalDate.of(2036, 3, 17).plusDays(i).toString();
				base.add(candle(date, c.get("base").get(i)));
				expected.add(candle(date, c.get("expected").get(i)));
			}
			List<Candle> leveraged = VirtualSimLeverage.convert(base, c.get("startPrice").asLong(), c.get("k").asInt());
			assertThat(leveraged).as(c.toString()).isEqualTo(expected);
			assertThat(leveraged).allSatisfy(x -> assertThat(x.valid()).isTrue());
			assertThat(VirtualSimService.span(base)).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("underlyingReturnRate").asString()));
			assertThat(VirtualSimService.span(leveraged)).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("leveragedReturnRate").asString()));
		}
		assertThat(org.assertj.core.api.Assertions.catchThrowable(() -> VirtualSimLeverage.convert(List.of(), 10000, 4)))
			.isInstanceOf(IllegalArgumentException.class);
	}

	/** 예시 룰셋으로 만든 구간: 1배는 기초 봉 그대로, 2·3배는 모든 봉이 1 이상이고 봉 순서를 지킨다 */
	@Test
	void leverage_on_generated_plans() {
		VirtualSimRuleset rules = VirtualSimSample.ruleset();
		Set<VirtualSimCategory> available = rules.categories().stream().map(CategoryStats::category).collect(java.util.stream.Collectors.toSet());
		for (long seed = 1; seed <= 200; seed++) {
			Plan plan = VirtualSimGenerator.generate(seed, rules, available, LocalDate.of(2026, 11, 11));
			assertThat(VirtualSimLeverage.convert(plan.candles(), plan.startPrice(), 1)).isEqualTo(plan.candles());
			for (int k = 2; k <= VirtualSimLeverage.MAX; k++) {
				List<Candle> leveraged = VirtualSimLeverage.convert(plan.candles(), plan.startPrice(), k);
				assertThat(leveraged).hasSameSizeAs(plan.candles());
				assertThat(leveraged).allSatisfy(x -> assertThat(x.valid()).as("seed " + x).isTrue());
				for (int i = 0; i < leveraged.size(); i++) {
					assertThat(leveraged.get(i).date()).isEqualTo(plan.candles().get(i).date());
				}
			}
		}
	}

	// ───────── 생성 성질(예시 룰셋, 시드 여러 개) ─────────

	@Test
	void sample_ruleset_has_five_types_two_with_trend() {
		VirtualSimRuleset rules = VirtualSimSample.ruleset();
		assertThat(rules.isSample()).isTrue();
		assertThat(rules.version()).isEqualTo(VirtualSimRuleset.VERSION);
		assertThat(rules.categories()).hasSize(5);
		assertThat(rules.categories().stream().filter(CategoryStats::clear).map(CategoryStats::category))
			.containsExactlyInAnyOrder(VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.BUYBACK_ACQUIRE);
		assertThat(rules.categories()).allSatisfy(c -> assertThat(c.samples()).allSatisfy(p -> assertThat(p).hasSize(VirtualSimRules.PATH_DAYS)));
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
			// 사건 봉과 그 뒤 1~5번째 봉의 종가는 그 유형에서 뽑은 경로 값 6개로 만든 것이다(v3)
			for (Planned e : events) {
				assertThat(rules.stats(e.category()).orElseThrow().samples()).anyMatch(s -> java.util.Arrays.equals(s, e.path()));
				assertThat(e.category().titles()).contains(e.title());
				for (int k = 0; k <= 5; k++) {
					long p = c.get(e.index() + k - 1).close();
					long expected = Math.floorDiv(p * (10_000L + e.path()[k]), 10_000L);
					long upper = Math.floorDiv(p * 13_000, 10_000L), lower = Math.max(1, -Math.floorDiv(-p * 7_000, 10_000L));
					assertThat(c.get(e.index() + k).close()).isEqualTo(Math.max(lower, Math.min(upper, expected)));
				}
			}
		}
		assertThat(counts).contains(3, 4, 5);
		assertThat(lengths.size()).isGreaterThan(50);
	}

	/** v2 룰셋(경로 5개)으로 시작한 대회 판을 정산할 때: 사건 뒤 1~5번째 봉만 경로 값이다(v3 생성기에서도 v2와 같은 봉) */
	@Test
	void generation_with_v2_ruleset_keeps_follow_only_paths() {
		VirtualSimRuleset v3 = VirtualSimSample.ruleset();
		VirtualSimRuleset v2 = new VirtualSimRuleset(VirtualSimRuleset.V2, null, null, true, v3.sources(), v3.categories().stream()
			.map(c -> new CategoryStats(c.category(), c.paths(), c.up(), c.down(), c.flat(), c.upShare(), c.medianBp(), c.p25Bp(), c.p75Bp(), c.volumeRatio(),
					c.trend(), c.samples().stream().map(x -> java.util.Arrays.copyOfRange(x, 1, x.length)).toList()))
			.toList(), v3.grades());
		Set<VirtualSimCategory> available = v2.categories().stream().map(CategoryStats::category).collect(java.util.stream.Collectors.toSet());
		for (long seed = 1; seed <= 50; seed++) {
			Plan plan = VirtualSimGenerator.generate(seed, v2, available, LocalDate.of(2026, 11, 10));
			for (Planned e : plan.events()) {
				assertThat(e.path()).hasSize(5);
				for (int k = 1; k <= 5; k++) {
					long p = plan.candles().get(e.index() + k - 1).close();
					long expected = Math.floorDiv(p * (10_000L + e.path()[k - 1]), 10_000L);
					long upper = Math.floorDiv(p * 13_000, 10_000L), lower = Math.max(1, -Math.floorDiv(-p * 7_000, 10_000L));
					assertThat(plan.candles().get(e.index() + k).close()).isEqualTo(Math.max(lower, Math.min(upper, expected)));
				}
			}
		}
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
