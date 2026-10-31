package com.flexable.web.deposit;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.TestFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §6 예시 표 = tests/policy/deposit.json. 표를 고치면 이 테스트가 계산기와 맞는지 확인한다. */
class DepositPolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "deposit.json")));
	}

	@TestFactory
	Stream<DynamicTest> 정기예금_계산_예시() throws Exception {
		return root().get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			Long limit = c.get("maxLimit").isNull() ? null : c.get("maxLimit").asLong();
			int months = c.get("months").asInt();
			BigDecimal rate = new BigDecimal(c.get("ratePercent").asString());
			boolean compound = c.get("compound").asBoolean();
			var r = DepositCalculator.calculate(c.get("amount").asLong(), limit, months, rate, compound);
			JsonNode e = c.get("expected");
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.excludedAmount()).as("excludedAmount").isEqualTo(e.get("excludedAmount").asLong());
			assertThat(r.interestPreTax()).as("interestPreTax").isEqualTo(e.get("interestPreTax").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.interestAfterTax()).as("interestAfterTax").isEqualTo(e.get("interestAfterTax").asLong());
			assertThat(r.maturityAmount()).as("maturityAmount").isEqualTo(e.get("maturityAmount").asLong());
			if (c.has("series")) {
				long[] byMonth = DepositCalculator.accruedByMonth(c.get("amount").asLong(), limit, months, rate, compound);
				for (JsonNode p : c.get("series")) {
					assertThat(byMonth[p.get("month").asInt() - 1]).as("month " + p.get("month").asInt()).isEqualTo(p.get("interestPreTax").asLong());
				}
			}
		}));
	}
}
