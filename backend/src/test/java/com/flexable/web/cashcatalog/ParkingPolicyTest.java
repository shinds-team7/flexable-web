package com.flexable.web.cashcatalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.Map;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §11 = tests/policy/parking-calc.json. 계산식과 계산 가능 판정이 코드와 맞는지 확인한다. */
class ParkingPolicyTest {

	private static final Map<String, String> REASONS = Map.of("LIMITED", ParkingCalculator.LIMITED,
			"TIERED", ParkingCalculator.TIERED, "NO_BASE", ParkingCalculator.NO_BASE);

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build()
				.readTree(Files.readString(Path.of("..", "tests", "policy", "parking-calc.json")));
	}

	@Test
	void 버전과_상한이_정책_파일과_같다() throws Exception {
		JsonNode root = root();
		assertThat(root.get("rulesVersion").asString()).isEqualTo(ParkingCalculator.RULES_VERSION);
		assertThat(root.get("limits").get("maxAmount").asLong()).isEqualTo(ParkingCalculator.MAX_AMOUNT);
		assertThat(root.get("limits").get("maxDays").asInt()).isEqualTo(ParkingCalculator.MAX_DAYS);
	}

	@TestFactory
	Stream<DynamicTest> 이자_계산() throws Exception {
		return root().get("calc").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			var r = ParkingCalculator.calculate(c.get("amount").asLong(), c.get("days").asInt(),
					new BigDecimal(c.get("rate").asString()));
			assertThat(r.interestPreTax()).isEqualTo(c.get("interestPreTax").asLong());
			assertThat(r.tax()).isEqualTo(c.get("tax").asLong());
			assertThat(r.interestAfterTax()).isEqualTo(c.get("interestAfterTax").asLong());
		}));
	}

	@TestFactory
	Stream<DynamicTest> 계산_가능_판정() throws Exception {
		return root().get("eligibility").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			BigDecimal base = c.get("baseRate").isNull() ? null : new BigDecimal(c.get("baseRate").asString());
			Product p = new Product("x", "합성은행", "합성 상품", "BANK", null, base, null, "VARIABLE_DEPOSIT",
					c.get("conditions").asString(), null, null, null, null, null, "출처", "https://example.com", null,
					null, OffsetDateTime.parse("2026-11-08T09:00:00+09:00"));
			String expected = c.get("reason").isNull() ? null : REASONS.get(c.get("reason").asString());
			assertThat(ParkingCalculator.reason(p)).isEqualTo(expected);
		}));
	}
}
