package com.flexable.web.policysavings;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §9 예시 표 = tests/policy/policy-savings.json. 표를 고치면 이 테스트가 계산기와 맞는지 확인한다. */
class PolicySavingsPolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build()
				.readTree(Files.readString(Path.of("..", "tests", "policy", "policy-savings.json")));
	}

	@Test
	void 구현_상태와_규칙_버전이_정책_파일과_같다() throws Exception {
		assertThat(root().get("status").asString()).isEqualTo("IMPLEMENTED");
		assertThat(root().get("rulesVersion").asString()).isEqualTo(PolicySavingsService.RULES_VERSION);
		assertThat(root().get("verificationStatus").asString()).isEqualTo(PolicySavingsService.VERIFICATION);
	}

	@TestFactory
	Stream<DynamicTest> 만기_계산_예시() throws Exception {
		return root().get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			var r = YouthFutureCalculator.calculate(LocalDate.parse(c.get("joinDate").asString()),
					c.get("monthly").asLong(), YouthFutureCalculator.Type.valueOf(c.get("type").asString()),
					new BigDecimal(c.get("baseRate").asString()), new BigDecimal(c.get("bonusRate").asString()), true);
			JsonNode e = c.get("expected");
			assertThat(r.maturityDate().toString()).as("maturityDate").isEqualTo(e.get("maturityDate").asString());
			assertThat(r.principal()).as("principal").isEqualTo(e.get("principal").asLong());
			assertThat(r.govContribution()).as("govContribution").isEqualTo(e.get("govContribution").asLong());
			assertThat(r.ownInterest()).as("ownInterest").isEqualTo(e.get("ownInterest").asLong());
			assertThat(r.contributionInterest()).as("contributionInterest")
					.isEqualTo(e.get("contributionInterest").asLong());
			assertThat(r.interestPreTax()).as("interestPreTax").isEqualTo(e.get("interestPreTax").asLong());
			assertThat(r.tax()).as("tax").isEqualTo(e.get("tax").asLong());
			assertThat(r.total()).as("total").isEqualTo(e.get("total").asLong());
		}));
	}

	@TestFactory
	Stream<DynamicTest> 입력_오류() throws Exception {
		return root().get("rejects").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			long monthly = c.has("monthly") ? c.get("monthly").asLong() : 500_000;
			int term = c.has("termMonths") ? c.get("termMonths").asInt() : 36;
			BigDecimal base = c.has("baseRate") ? new BigDecimal(c.get("baseRate").asString()) : BigDecimal.valueOf(5);
			var reject = YouthFutureCalculator.check(monthly, term, base, BigDecimal.ZERO);
			assertThat(reject).isNotNull();
			assertThat(reject.name()).isEqualTo(c.get("error").asString());
		}));
	}
}
