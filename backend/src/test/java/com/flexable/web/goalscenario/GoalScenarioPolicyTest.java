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
		assertThat(GoalScenarioService.REACH_BP).isEqualTo(new BigDecimal(c.get("reachShare").asString()).movePointRight(4).intValueExact());
		assertThat(GoalScenarioService.CMA_RATE).isEqualByComparingTo(new BigDecimal(c.get("cmaRatePercent").asString()));
		assertThat(SavedScenarioService.LIMIT).isEqualTo(c.get("saveLimit").asInt());
		assertThat(ScenarioResultCache.TTL.toMinutes()).isEqualTo(c.get("resultTtlMinutes").asLong());
		assertThat(GoalScenarioService.MIN_MONTHS).isEqualTo(c.get("minMonths").asInt());
		assertThat(GoalScenarioService.MAX_MONTHS).isEqualTo(c.get("maxMonths").asInt());
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
			Map<ProductType, Long> a = ScenarioMath.allocate(c.get("monthly").asLong(), m);
			JsonNode e = c.get("expected");
			assertThat(SavingsService.maturity(a.get(ProductType.SAVINGS), months, rate, compound).finalAmount()).as("SAVINGS")
				.isEqualTo(e.get("SAVINGS").asLong());
			assertThat(ScenarioMath.cma(a.get(ProductType.CMA), months, GoalScenarioService.CMA_RATE).finalAmount()).as("CMA")
				.isEqualTo(e.get("CMA").asLong());
			long[] f = GoalScenarioService.finals(m, months, 1, rate, compound, Map.of()).apply(c.get("monthly").asLong());
			assertThat(f[0]).as("final").isEqualTo(e.get("final").asLong());
		});
	}

	@TestFactory
	Stream<DynamicTest> 필요_월_금액() {
		return each("required", c -> {
			long target = c.get("target").asLong();
			int months = c.get("months").asInt();
			assertThat(new BigDecimal(c.get("reachShare") == null ? "0.8" : c.get("reachShare").asString()).movePointRight(4).intValueExact())
				.isEqualTo(GoalScenarioService.REACH_BP);
			Map<ProductType, Integer> m = mix(c.get("mix"));
			boolean invest = m.keySet().stream().anyMatch(ProductType::invest);
			Map<ProductType, List<BigDecimal[]>> factors = new EnumMap<>(ProductType.class);
			int n = 1;
			if (c.has("pathMonthlyReturns")) {
				List<BigDecimal> perPath = new ArrayList<>();
				for (JsonNode r : c.get("pathMonthlyReturns")) {
					BigDecimal[] path = new BigDecimal[months];
					java.util.Arrays.fill(path, new BigDecimal(r.asString()));
					perPath.add(ScenarioMath.factor(path));
				}
				n = perPath.size();
				factors.put(ProductType.KR_INDEX_ETF, List.<BigDecimal[]>of(perPath.toArray(BigDecimal[]::new)));
			}
			BigDecimal rate = c.has("savingsRatePercent") ? new BigDecimal(c.get("savingsRatePercent").asString()) : BigDecimal.ZERO;
			boolean compound = c.has("savingsCompound") && c.get("savingsCompound").asBoolean();
			var finals = GoalScenarioService.finals(m, months, n, rate, compound, factors);
			var r = GoalScenarioService.compute(target, months, n, invest, finals);
			JsonNode e = c.get("expected");
			assertThat(r != null).as("reachable").isEqualTo(e.get("reachable").asBoolean());
			assertThat(r.monthly()).as("monthly").isEqualTo(e.get("monthly").asLong());
			assertThat(r.paid()).as("paid").isEqualTo(e.get("paid").asLong());
			assertThat(r.outcome().chanceBp()).as("chanceBp").isEqualTo(e.get("chanceBp").asInt());
			assertThat(r.outcome().lossBp()).as("lossBp").isEqualTo(e.get("lossBp").asInt());
			if (e.has("fixedAmount")) {
				assertThat(r.outcome().kind()).isEqualTo("FIXED");
				assertThat(r.outcome().fixedAmount()).as("fixedAmount").isEqualTo(e.get("fixedAmount").asLong());
			}
			if (e.has("finals")) {
				assertThat(r.values()).as("finals").containsExactly(e.get("finals").valueStream().mapToLong(JsonNode::asLong).toArray());
				assertThat(r.outcome().low()).as("low").isEqualTo(e.get("low").asLong());
				assertThat(r.outcome().median()).as("median").isEqualTo(e.get("median").asLong());
				assertThat(r.outcome().high()).as("high").isEqualTo(e.get("high").asLong());
			}
			if (c.has("below")) {
				JsonNode b = c.get("below");
				long[] below = finals.apply(b.get("monthly").asLong());
				assertThat(ScenarioMath.reached(below, target)).as("below reached").isEqualTo(b.get("reached").asInt());
				assertThat(below).as("below worst reaching path").contains(b.get("worstReachingPathFinal").asLong());
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
			var req = new GoalScenarioDtos.Request(q.get("name").asString(), q.get("targetAmount").asLong(), q.get("months").asInt());
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
					facts = new ProposalText.Facts(f.get("targetAmount").asLong(), f.get("months").asInt(), names, percents, stats);
				}
				Proposals.Checked checked = Proposals.check(drafts, facts);
				if ("AI".equals(c.get("expected").get("proposer").asString())) {
					assertThat(checked.problem()).isNull();
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

	@Test
	void 우선주는_뺀다() {
		assertThat(GoalScenarioService.preferred("삼성전자우")).isTrue();
		assertThat(GoalScenarioService.preferred("현대차우B")).isTrue();
		assertThat(GoalScenarioService.preferred("삼성전자")).isFalse();
	}
}
