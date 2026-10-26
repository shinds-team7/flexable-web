package com.flexable.web.practice;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.util.stream.Stream;

import org.junit.jupiter.api.DynamicTest;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestFactory;

import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Portfolio;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.practice.PracticeEngine.Holding;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §5 예시 표 = tests/policy/practice.json. 표를 고치면 이 테스트가 엔진과 맞는지 확인한다. */
class PracticePolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "practice.json")));
	}

	/** 봉마다 시가에 앞선 선택을 체결하고 종가로 평가한다. START는 최초 배분 매수다. */
	private static Portfolio play(long initial, JsonNode bars, java.util.function.Consumer<Portfolio> eachBar) {
		var holding = new Holding(initial, 0);
		Portfolio value = null;
		for (JsonNode bar : bars) {
			String step = bar.get("actionBeforeBar").asString();
			Action action = "START".equals(step) ? Action.BUY : Action.valueOf(step);
			holding = PracticeEngine.trade(holding, action, bar.get("allocationPercent").asInt(), bar.get("open").asLong()).holding();
			value = PracticeEngine.value(holding, bar.get("close").asLong(), initial);
			eachBar.accept(value);
		}
		return value;
	}

	private static void assertPortfolio(Portfolio actual, JsonNode expected) {
		assertThat(actual.shares()).isEqualTo(expected.get("shares").asLong());
		assertThat(actual.cash()).isEqualTo(expected.get("cash").asLong());
		assertThat(actual.total()).isEqualTo(expected.get("total").asLong());
		assertThat(actual.profit()).isEqualTo(expected.get("profit").asLong());
		assertThat(actual.returnRate()).isEqualByComparingTo(new BigDecimal(expected.get("returnRate").asString()));
	}

	@Test
	void tradeSequence() throws Exception {
		JsonNode c = root().get("tradeSequence");
		var expected = c.get("bars").valueStream().map(b -> b.get("expected")).iterator();
		play(c.get("initialAmount").asLong(), c.get("bars"), p -> assertPortfolio(p, expected.next()));
	}

	@Test
	void insufficientCash() throws Exception {
		JsonNode c = root().get("insufficientCash");
		var holding = PracticeEngine.trade(new Holding(c.get("initialAmount").asLong(), 0), Action.BUY,
				root().get("initialAllocationPercent").asInt(), c.get("open").asLong()).holding();
		assertPortfolio(PracticeEngine.value(holding, c.get("close").asLong(), c.get("initialAmount").asLong()), c.get("expected"));
	}

	@Test
	void negativeRounding() throws Exception {
		JsonNode c = root().get("negativeRounding");
		assertPortfolio(play(c.get("initialAmount").asLong(), c.get("bars"), p -> { }), c.get("expected"));
	}

	@TestFactory
	Stream<DynamicTest> quizCases() throws Exception {
		return root().get("quizCases").valueStream().map(c -> DynamicTest.dynamicTest(c.toString(), () -> {
			long baseline = c.get("baseline").asLong(), after = c.get("afterFiveSessions").asLong();
			assertThat(PracticeEngine.outcome(baseline, after, Prediction.valueOf(c.get("prediction").asString())))
				.isEqualTo(c.get("expected").asString());
			assertThat(PracticeEngine.rate(after - baseline, baseline))
				.isEqualByComparingTo(new BigDecimal(c.get("returnRate").asString()));
		}));
	}
}
