package com.flexable.web.simulation;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.List;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import com.flexable.web.market.DailyClose;
import com.flexable.web.simulation.SimulationEngine.LegInput;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §2 예시 표 = tests/policy/simulation.json. 표를 고치면 이 테스트가 코드와 맞는지 확인한다. */
class SimulationPolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "simulation.json")));
	}

	private static BigDecimal dec(JsonNode n) {
		return n.isNull() ? null : new BigDecimal(n.asString());
	}

	@TestFactory
	Stream<DynamicTest> weights() throws Exception {
		return root().get("weights").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			List<SimulationDtos.Leg> legs = c.get("input").valueStream().map(w -> new SimulationDtos.Leg("A", dec(w))).toList();
			if (c.has("error")) {
				assertThatThrownBy(() -> SimulationService.weights(legs)).hasMessage(c.get("error").asString());
				return;
			}
			List<BigDecimal> out = SimulationService.weights(legs);
			List<BigDecimal> expected = c.get("expected").valueStream().map(SimulationPolicyTest::dec).toList();
			assertThat(out).usingElementComparator(BigDecimal::compareTo).containsExactlyElementsOf(expected);
		}));
	}

	@TestFactory
	Stream<DynamicTest> allocate() throws Exception {
		return root().get("allocate").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			List<LegInput> legs = c.get("weights").valueStream().map(w -> new LegInput("A", dec(w), List.of())).toList();
			long[] expected = c.get("expected").valueStream().mapToLong(JsonNode::asLong).toArray();
			assertThat(SimulationEngine.allocate(c.get("amount").asLong(), legs)).containsExactly(expected);
		}));
	}

	@TestFactory
	Stream<DynamicTest> rate() throws Exception {
		return root().get("rate").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () ->
			assertThat(SimulationEngine.rate(c.get("profit").asLong(), c.get("invested").asLong()))
				.isEqualByComparingTo(dec(c.get("expected")))));
	}

	@TestFactory
	Stream<DynamicTest> runs() throws Exception {
		return root().get("runs").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			List<DailyClose> closes = c.get("closes").valueStream()
				.map(d -> new DailyClose(LocalDate.parse(d.get(0).asString()), d.get(1).asLong()))
				.toList();
			var r = SimulationEngine.run(new SimulationEngine.Input(LocalDate.parse(c.get("startDate").asString()),
					SimulationEngine.Mode.valueOf(c.get("mode").asString()), c.get("totalAmount").asLong(),
					c.get("monthlyAmount").asLong(), List.of(new LegInput("A", BigDecimal.ONE, closes))));
			JsonNode ex = c.get("expected");
			assertThat(r.contributionCount()).isEqualTo(ex.get("contributionCount").asInt());
			assertThat(r.totalInvested()).isEqualTo(ex.get("totalInvested").asLong());
			assertThat(r.finalValue()).isEqualTo(ex.get("finalValue").asLong());
			assertThat(r.profit()).isEqualTo(ex.get("profit").asLong());
			assertThat(r.returnRate()).isEqualByComparingTo(dec(ex.get("returnRate")));
		}));
	}
}
