package com.flexable.web.cashcatalog;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.OffsetDateTime;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §12 = tests/policy/cma-calc.json. */
class CmaPolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "cma-calc.json")));
	}

	private static String reason(String key) {
		return switch (key) {
			case "NO_RATE" -> CmaCalculator.NO_RATE;
			case "PERIOD" -> CmaCalculator.PERIOD;
			case "TIERED" -> CmaCalculator.TIERED;
			default -> throw new IllegalArgumentException(key);
		};
	}

	@Test
	void 버전이_정책_파일과_같다() throws Exception {
		assertThat(root().get("rulesVersion").asString()).isEqualTo(CmaCalculator.RULES_VERSION);
	}

	@TestFactory
	Stream<DynamicTest> 이자_계산() throws Exception {
		return root().get("calc").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			var r = ParkingCalculator.calculate(c.get("amount").asLong(), c.get("days").asInt(), new BigDecimal(c.get("rate").asString()));
			assertThat(r.interestPreTax()).isEqualTo(c.get("interestPreTax").asLong());
			assertThat(r.tax()).isEqualTo(c.get("tax").asLong());
			assertThat(r.interestAfterTax()).isEqualTo(c.get("interestAfterTax").asLong());
		}));
	}

	@TestFactory
	Stream<DynamicTest> 보유_기간별_수익률() throws Exception {
		JsonNode root = root();
		var periods = CmaCalculator.periods(root.get("periodTable").asString());
		return root.get("periodCalc").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			BigDecimal rate = CmaCalculator.rateFor(periods, c.get("days").asInt());
			if (c.get("rate").isNull()) {
				assertThat(rate).isNull();
			} else {
				assertThat(rate).isEqualByComparingTo(c.get("rate").asString());
			}
		}));
	}

	@TestFactory
	Stream<DynamicTest> 기간_구간표_읽기() throws Exception {
		return root().get("periods").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () ->
				assertThat(CmaCalculator.periods(c.get("conditions").asString()) != null).isEqualTo(c.get("valid").asBoolean())));
	}

	@TestFactory
	Stream<DynamicTest> 계산_가능_판정() throws Exception {
		return root().get("eligibility").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			Product p = new Product("x", "합성증권", "합성 CMA", "SECURITIES", "RP",
					c.get("baseRate").isNull() ? null : new BigDecimal(c.get("baseRate").asString()),
					c.get("maxRate").isNull() ? null : new BigDecimal(c.get("maxRate").asString()), "AGREED",
					c.get("conditions").asString(), null, null, null, null, null, "출처", "https://example.com", null, null,
					OffsetDateTime.parse("2026-11-08T09:00:00+09:00"));
			var a = CmaCalculator.assess(p);
			assertThat(a.mode()).isEqualTo(c.get("mode").isNull() ? null : c.get("mode").asString());
			assertThat(a.reason()).isEqualTo(c.get("reason").isNull() ? null : reason(c.get("reason").asString()));
		}));
	}
}
