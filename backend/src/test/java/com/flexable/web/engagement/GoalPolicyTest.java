package com.flexable.web.engagement;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.YearMonth;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §3 예시 표 = tests/policy/goal.json. 표를 고치면 이 테스트가 코드와 맞는지 확인한다. */
class GoalPolicyTest {

	@TestFactory
	Stream<DynamicTest> goalPolicyCases() throws Exception {
		JsonNode root = JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "goal.json")));
		YearMonth now = YearMonth.parse(root.get("now").asString());
		return root.get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			JsonNode in = c.get("input");
			JsonNode ex = c.get("expected");
			Long pace = in.get("monthlyPace").isNull() ? null : in.get("monthlyPace").asLong();
			var p = GoalMath.calculate(in.get("amount").asLong(), in.get("current").asLong(), pace,
					YearMonth.parse(in.get("due").asString()), now).progress();
			assertThat(p.status()).isEqualTo(ex.get("status").asString());
			assertThat(p.remaining()).isEqualTo(ex.get("remaining").asLong());
			assertThat(p.ratioBp()).isEqualTo(ex.get("ratioBp").asInt());
			assertThat(p.monthsLeft()).isEqualTo(ex.get("monthsLeft").asLong());
			assertThat(p.requiredMonthly()).isEqualTo(nullableLong(ex.get("requiredMonthly")));
			assertThat(p.expectedMonths()).isEqualTo(nullableLong(ex.get("expectedMonths")));
			assertThat(p.expectedMonth()).isEqualTo(ex.get("expectedMonth").isNull() ? null : ex.get("expectedMonth").asString());
			assertThat(p.monthlyGap()).isEqualTo(ex.get("monthlyGap").asLong());
			assertThat(p.dailyGap()).isEqualTo(ex.get("dailyGap").asLong());
		}));
	}

	private static Long nullableLong(JsonNode n) {
		return n.isNull() ? null : n.asLong();
	}
}
