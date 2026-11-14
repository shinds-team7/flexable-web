package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import com.flexable.web.common.ApiException;
import com.flexable.web.savings.SavingsService;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §7 예시 표 = tests/policy/goal-scenarios.json. 표를 고치면 이 테스트가 계산과 맞는지 확인한다. */
class GoalScenarioPolicyTest {

	private static final JsonNode ROOT = root();

	private static JsonNode root() {
		try {
			return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "goal-scenarios.json")));
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	private static Stream<DynamicTest> each(String key, java.util.function.Consumer<JsonNode> check) {
		return ROOT.get(key).valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> check.accept(c)));
	}

	private static Map<ProductType, Integer> mix(JsonNode m) {
		Map<ProductType, Integer> out = new EnumMap<>(ProductType.class);
		m.properties().forEach(e -> out.put(ProductType.valueOf(e.getKey()), e.getValue().asInt()));
		return out;
	}

	private static BigDecimal[] decimals(JsonNode arr) {
		return arr.valueStream().map(v -> new BigDecimal(v.asString())).toArray(BigDecimal[]::new);
	}

	@Test
	void 상수() {
		JsonNode c = ROOT.get("constants");
		assertThat(ROOT.get("status").asString()).isEqualTo("IMPLEMENTED");
		assertThat(GoalScenarioService.PATHS).isEqualTo(c.get("paths").asInt());
		assertThat(GoalScenarioService.SEED).isEqualTo(c.get("seed").asLong());
		assertThat(GoalScenarioService.BLOCK).isEqualTo(c.get("blockMonths").asInt());
		assertThat(GoalScenarioService.HISTORY).isEqualTo(c.get("historyMonths").asInt());
		assertThat(GoalScenarioService.CMA_RATE).isEqualByComparingTo(new BigDecimal(c.get("cmaRatePercent").asString()));
		assertThat(SavedScenarioService.LIMIT).isEqualTo(c.get("saveLimit").asInt());
		assertThat(ScenarioResultCache.TTL.toMinutes()).isEqualTo(c.get("resultTtlMinutes").asLong());
		assertThat(GoalScenarioService.MIN_MONTHS).isEqualTo(c.get("minMonths").asInt());
		assertThat(GoalScenarioService.MAX_MONTHS).isEqualTo(c.get("maxMonths").asInt());
		assertThat(ScenarioBudget.MONTHLY_MIN).isEqualTo(c.get("monthlyMin").asLong());
		assertThat(ScenarioBudget.MONTHLY_MAX).isEqualTo(c.get("monthlyMax").asLong());
		assertThat(ScenarioBudget.UNIT).isEqualTo(c.get("amountUnit").asLong());
		assertThat(ScenarioBudget.START_MAX).isEqualTo(c.get("startMax").asLong());
		assertThat(ScenarioBudget.TARGET_MIN).isEqualTo(c.get("targetMin").asLong());
		assertThat(ScenarioBudget.TARGET_MAX).isEqualTo(c.get("targetMax").asLong());
		assertThat(new GoalScenarioAiProperties(null, null, null, null).dailyLimit(ScenarioAiQuota.Plan.FREE)).isEqualTo(c.get("dailyLimit").asInt());
		for (ScenarioTier t : ScenarioTier.values()) {
			JsonNode band = c.get("tiers").get(t.name());
			assertThat(t.minInvest()).as(t.name()).isEqualTo(band.get(0).asInt());
			assertThat(t.maxInvest()).as(t.name()).isEqualTo(band.get(1).asInt());
		}
	}

	@TestFactory
	Stream<DynamicTest> 적금() {
		return each("savings", c -> {
			var r = SavingsService.maturity(c.get("monthly").asLong(), c.get("months").asInt(), new BigDecimal(c.get("ratePercent").asString()),
					c.get("compound").asBoolean());
			JsonNode e = c.get("expected");
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.interestPreTax()).as("interestPreTax").isEqualTo(e.get("interestPreTax").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.finalAmount()).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> CMA() {
		return each("cma", c -> {
			var r = ScenarioMath.cma(c.get("monthly").asLong(), c.get("months").asInt(), new BigDecimal(c.get("ratePercent").asString()));
			JsonNode e = c.get("expected");
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.gain()).as("interestPreTax").isEqualTo(e.get("interestPreTax").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.finalAmount()).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 투자() {
		return each("invest", c -> {
			BigDecimal[] returns = decimals(c.get("returns"));
			var r = ScenarioMath.invest(c.get("monthly").asLong(), returns.length, ScenarioMath.factor(returns), c.get("taxed").asBoolean());
			JsonNode e = c.get("expected");
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.principal() + r.gain()).as("value").isEqualTo(e.get("value").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.finalAmount()).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 시작_금액이_있는_CMA() {
		return each("cmaStart", c -> {
			var r = ScenarioMath.cma(c.get("start").asLong(), c.get("monthly").asLong(), c.get("months").asInt(), new BigDecimal(c.get("ratePercent").asString()));
			JsonNode e = c.get("expected");
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.gain()).as("interestPreTax").isEqualTo(e.get("interestPreTax").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.finalAmount()).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 시작_금액이_있는_투자() {
		return each("investStart", c -> {
			BigDecimal[] returns = decimals(c.get("returns"));
			var r = ScenarioMath.invest(c.get("monthly").asLong(), c.get("start").asLong(), returns.length, ScenarioMath.factor(returns),
					ScenarioMath.growth(returns), c.get("taxed").asBoolean());
			JsonNode e = c.get("expected");
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.principal() + r.gain()).as("value").isEqualTo(e.get("value").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.finalAmount()).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 시작_금액_배분() {
		return each("allocationStart", c -> {
			long start = c.get("start").asLong();
			Map<ProductType, Long> a = ScenarioMath.allocateStart(start, mix(c.get("mix")));
			JsonNode e = c.get("expected");
			for (ProductType t : ProductType.values()) {
				assertThat(a.get(t)).as(t.name()).isEqualTo(e.get(t.name()).asLong());
			}
			long kospi = a.get(ProductType.KOSPI_TOP5);
			assertThat(GoalScenarioService.itemStart(kospi, 5, 0)).as("kospiFirst").isEqualTo(e.get("kospiFirst").asLong());
			assertThat(GoalScenarioService.itemStart(kospi, 5, 1)).as("kospiOther").isEqualTo(e.get("kospiOther").asLong());
			assertThat(a.values().stream().mapToLong(Long::longValue).sum()).as("sum").isEqualTo(e.get("sum").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 배분() {
		return each("allocation", c -> {
			Map<ProductType, Long> a = ScenarioMath.allocate(c.get("monthly").asLong(), mix(c.get("mix")));
			JsonNode e = c.get("expected");
			for (ProductType t : ProductType.values()) {
				assertThat(a.get(t)).as(t.name()).isEqualTo(e.get(t.name()).asLong());
			}
			assertThat(a.get(ProductType.KOSPI_TOP5) / 5).as("kospiEach").isEqualTo(e.get("kospiEach").asLong());
			assertThat(a.values().stream().mapToLong(Long::longValue).sum()).as("sum").isEqualTo(e.get("sum").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 만기_뒤_CMA() {
		return each("afterMaturity", c -> {
			int months = c.get("months").asInt();
			int term = c.get("savingsTermMonths").asInt();
			long monthly = c.get("monthly").asLong();
			BigDecimal rate = new BigDecimal(c.get("savingsRatePercent").asString());
			boolean compound = c.get("savingsCompound").asBoolean();
			JsonNode e = c.get("expected");
			long matured = SavingsService.maturity(monthly, term, rate, compound).finalAmount();
			assertThat(matured).as("matured").isEqualTo(e.get("matured").asLong());
			var after = ScenarioMath.cma(matured, monthly, months - term, GoalScenarioService.CMA_RATE);
			assertThat(after.gain()).as("afterInterestPreTax").isEqualTo(e.get("afterInterestPreTax").asLong());
			assertThat(after.tax()).as("afterTax").isEqualTo(e.get("afterTax").asLong());
			assertThat(GoalScenarioService.savingsFinal(monthly, months, term, rate, compound)).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 경로_길이() {
		return each("pathLength", c -> {
			int months = c.get("months").asInt();
			assertThat(GoalScenarioService.blocks(months)).as("blocks").isEqualTo(c.get("expected").get("blocks").asInt());
			// 묶음을 이어 붙인 뒤 앞에서 기한 개월만 쓴다: 수익률이 달마다 다른 60개월로 확인한다
			BigDecimal[] returns = new BigDecimal[GoalScenarioService.HISTORY];
			for (int i = 0; i < returns.length; i++) {
				returns[i] = new BigDecimal(i).movePointLeft(3);
			}
			int[][] draws = GoalScenarioService.draws(GoalScenarioService.blocks(months));
			BigDecimal[] f = GoalScenarioService.factors(returns, new int[][] { draws[0] }, months);
			BigDecimal[] path = new BigDecimal[months];
			for (int m = 0; m < months; m++) {
				path[m] = returns[draws[0][m / GoalScenarioService.BLOCK] + m % GoalScenarioService.BLOCK];
			}
			assertThat(f[0]).isEqualByComparingTo(ScenarioMath.factor(path));
			// 12·24·36개월은 묶음 수만큼 그대로 쓴다(바뀌기 전 결과와 같다)
			if (months % GoalScenarioService.BLOCK == 0) {
				assertThat(path.length).isEqualTo(draws[0].length * GoalScenarioService.BLOCK);
			}
		});
	}

	@TestFactory
	Stream<DynamicTest> 적금과_CMA_혼합() {
		return each("mixFixed", c -> {
			int months = c.get("months").asInt();
			BigDecimal rate = new BigDecimal(c.get("savingsRatePercent").asString());
			boolean compound = c.get("savingsCompound").asBoolean();
			Map<ProductType, Integer> m = mix(c.get("mix"));
			var in = new GoalScenarioService.Inputs(m, c.get("start").asLong(), c.get("monthly").asLong(), months, months, rate, compound);
			Map<ProductType, Long> a = in.monthlyParts();
			JsonNode e = c.get("expected");
			assertThat(SavingsService.maturity(a.get(ProductType.SAVINGS), months, rate, compound).finalAmount()).as("SAVINGS")
				.isEqualTo(e.get("SAVINGS").asLong());
			// 시작 금액의 적금 몫은 CMA로 계산한다(§7-4)
			assertThat(ScenarioMath.cma(in.cmaStart(), a.get(ProductType.CMA), months, GoalScenarioService.CMA_RATE).finalAmount()).as("CMA")
				.isEqualTo(e.get("CMA").asLong());
			long[] f = GoalScenarioService.finals(in, 1, Map.of(), Map.of());
			assertThat(f[0]).as("final").isEqualTo(e.get("final").asLong());
			// 그래프의 마지막 달도 같은 값이다
			assertThat(GoalScenarioService.fixedSeries(in)[months]).as("series last").isEqualTo((double) e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 결과() {
		return each("outcome", c -> {
			long[] values = c.get("values").valueStream().mapToLong(JsonNode::asLong).toArray();
			var o = GoalScenarioService.outcome(values, c.get("paid").asLong(), longOrNull(c.get("target")), c.get("invest").asBoolean());
			JsonNode e = c.get("expected");
			assertThat(o.kind()).isEqualTo(e.get("kind").asString());
			assertThat(o.highGain()).as("highGain").isEqualTo(e.get("highGain").asLong());
			assertThat(o.chanceBp()).as("chanceBp").isEqualTo(e.get("chanceBp").isNull() ? null : e.get("chanceBp").asInt());
			assertThat(o.lossBp()).as("lossBp").isEqualTo(e.get("lossBp").asInt());
			if (e.has("fixedAmount")) {
				assertThat(o.fixedAmount()).as("fixedAmount").isEqualTo(e.get("fixedAmount").asLong());
			}
			else {
				assertThat(o.low()).as("low").isEqualTo(e.get("low").asLong());
				assertThat(o.median()).as("median").isEqualTo(e.get("median").asLong());
				assertThat(o.high()).as("high").isEqualTo(e.get("high").asLong());
			}
		});
	}

	@TestFactory
	Stream<DynamicTest> 단계() {
		return each("tiers", c -> {
			Map<ProductType, Integer> m = mix(c.get("mix"));
			JsonNode e = c.get("expected");
			assertThat(ScenarioTier.investShare(m)).isEqualTo(e.get("investShare").asInt());
			for (ScenarioTier t : ScenarioTier.values()) {
				assertThat(t.accepts(m)).as(t.name()).isEqualTo(t.name().equals(e.get("tier").asString()));
			}
		});
	}

	@TestFactory
	Stream<DynamicTest> 분위_위치() {
		return ROOT.get("quantileIndex").valueStream().map(c -> DynamicTest.dynamicTest("n=" + c.get("n").asInt(), () -> {
			int n = c.get("n").asInt();
			JsonNode e = c.get("expected");
			assertThat(ScenarioMath.quantileIndex(n, 1000)).isEqualTo(e.get("low").asInt());
			assertThat(ScenarioMath.quantileIndex(n, 5000)).isEqualTo(e.get("median").asInt());
			assertThat(ScenarioMath.quantileIndex(n, 9000)).isEqualTo(e.get("high").asInt());
		}));
	}

	@TestFactory
	Stream<DynamicTest> 입력_검증() {
		return each("validation", c -> {
			JsonNode q = c.get("request");
			var req = new GoalScenarioDtos.Request(longOrNull(q.get("startAmount")), longOrNull(q.get("monthlyBudget")),
					q.get("months").asInt(), longOrNull(q.get("targetAmount")));
			String field = c.get("expected").get("field").asString();
			assertThatThrownBy(() -> GoalScenarioService.validate(req)).isInstanceOfSatisfying(ApiException.class,
					ex -> assertThat(((Map<?, ?>) ex.extra().get("fields")).keySet()).map(String::valueOf).contains(field));
		});
	}

	@TestFactory
	Stream<DynamicTest> 제안_검증() {
		return ROOT.get("proposal").valueStream().filter(c -> !c.get("scenarios").isNull())
			.map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
				List<Proposals.Draft> drafts = new ArrayList<>();
				int i = 0;
				for (JsonNode s : c.get("scenarios")) {
					Map<String, Integer> m = new LinkedHashMap<>();
					s.get("mix").properties().forEach(e -> m.put(e.getKey(), e.getValue().asInt()));
					String explanation = s.has("explanation") ? s.get("explanation").asString() : "조합 해설이에요";
					drafts.add(new Proposals.Draft("s" + i++, "조합", "한 줄 설명", explanation, m));
				}
				ProposalText.Facts facts = ProposalText.Facts.NONE;
				JsonNode f = c.get("facts");
				if (f != null) {
					java.util.Set<String> names = new java.util.HashSet<>();
					f.get("names").forEach(n -> names.add(n.asString()));
					List<java.math.BigDecimal> percents = new ArrayList<>();
					f.get("percents").forEach(n -> percents.add(new java.math.BigDecimal(n.asString())));
					Map<ProposalText.StatKind, List<java.math.BigDecimal>> stats = new java.util.EnumMap<>(ProposalText.StatKind.class);
					if (f.has("stats")) {
						f.get("stats").properties().forEach(e -> {
							List<java.math.BigDecimal> values = new ArrayList<>();
							e.getValue().forEach(n -> values.add(new java.math.BigDecimal(n.asString())));
							stats.put(ProposalText.StatKind.valueOf(e.getKey()), values);
						});
					}
					facts = new ProposalText.Facts(f.get("targetAmount").asLong(), f.has("monthlyBudget") ? f.get("monthlyBudget").asLong() : 0,
							f.get("months").asInt(), names, percents, stats);
				}
				Proposals.Checked checked = Proposals.check(drafts, facts);
				if ("AI".equals(c.get("expected").get("proposer").asString())) {
					assertThat(checked.problem()).isNull();
					if (c.get("expected").has("ids")) {
						assertThat(checked.plans()).extracting(Proposals.Plan::id)
							.containsExactlyElementsOf(c.get("expected").get("ids").valueStream().map(JsonNode::asString).toList());
					}
				}
				else {
					assertThat(checked.plans()).isNull();
				}
			}));
	}

	@Test
	void 데모_조합() {
		List<Proposals.Plan> plans = Proposals.validate(Proposals.DEMO).orElseThrow();
		JsonNode demo = ROOT.get("demoPlans");
		assertThat(plans).hasSize(demo.size());
		for (int i = 0; i < plans.size(); i++) {
			JsonNode d = demo.get(i);
			assertThat(plans.get(i).id()).isEqualTo(d.get("id").asString());
			assertThat(plans.get(i).title()).isEqualTo(d.get("title").asString());
			Map<ProductType, Integer> expected = mix(d.get("mix"));
			expected.values().removeIf(r -> r == 0);
			assertThat(plans.get(i).mix()).isEqualTo(expected);
		}
	}

	/** 결과 문장(§7-5 resultText). 서버 값과 같은 숫자를 화면과 같은 내림 표기로 넣는다. */
	@TestFactory
	Stream<DynamicTest> 결과_문장() {
		return each("resultText", c -> {
			JsonNode o = c.get("outcome");
			GoalScenarioDtos.Outcome outcome = o == null || o.isNull() ? null
					: new GoalScenarioDtos.Outcome(o.get("kind").asString(), longOrNull(o.get("fixedAmount")), longOrNull(o.get("low")),
							longOrNull(o.get("median")), longOrNull(o.get("high")), longOrNull(o.get("highGain")),
							o.get("chanceBp").isNull() ? null : o.get("chanceBp").asInt(), o.get("lossBp").asInt());
			assertThat(ScenarioResultText.of(c.get("start").asLong(), longOrNull(c.get("monthly")), outcome, longOrNull(c.get("target")),
					c.get("months").asInt())).isEqualTo(c.get("expected").asString());
		});
	}

	private static Long longOrNull(JsonNode n) {
		return n == null || n.isNull() ? null : n.asLong();
	}

	@Test
	void 우선주는_뺀다() {
		assertThat(GoalScenarioService.preferred("삼성전자우")).isTrue();
		assertThat(GoalScenarioService.preferred("현대차우B")).isTrue();
		assertThat(GoalScenarioService.preferred("삼성전자")).isFalse();
	}
}
