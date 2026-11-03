package com.flexable.web.practice;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
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

	@Test
	void windowRuleConstants() throws Exception {
		JsonNode c = root().get("windowSelection");
		assertThat(PracticeWindow.MIN_LENGTH).isEqualTo(c.get("minLength").asInt());
		assertThat(PracticeWindow.MAX_LENGTH).isEqualTo(c.get("maxLength").asInt());
		assertThat(PracticeWindow.LEAD_DAYS).isEqualTo(c.get("leadDays").asInt());
		assertThat(PracticeWindow.FOLLOW_DAYS).isEqualTo(c.get("followDays").asInt());
		assertThat(PracticeWindow.MIN_QUESTIONS).isEqualTo(c.get("minQuestions").asInt());
	}

	/** 봉 위치 = 평일 날짜, 공시는 그 봉 날짜에 접수한 것으로 둔다. invalidBars는 OHLC가 빠진 봉(0)이다. */
	@TestFactory
	Stream<DynamicTest> windowSelection() throws Exception {
		return root().get("windowSelection").get("cases").valueStream().map(c -> DynamicTest.dynamicTest(c.get("name").asString(), () -> {
			var invalid = c.get("invalidBars").valueStream().map(JsonNode::asInt).toList();
			var candles = new ArrayList<Candle>();
			for (var d = LocalDate.of(2024, 1, 1); candles.size() < c.get("bars").asInt(); d = d.plusDays(1)) {
				if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) continue;
				candles.add(invalid.contains(candles.size()) ? new Candle(d.toString(), 0, 0, 0, 1000) : new Candle(d.toString(), 1000, 1000, 1000, 1000));
			}
			List<News> news = c.get("disclosureBars").valueStream().map(JsonNode::asInt)
				.map(i -> new News("d" + i, "공시 " + i, candles.get(i).date(), "https://dart.fss.or.kr/", "DART")).toList();
			var choice = PracticeWindow.select(candles, news);
			JsonNode expected = c.get("expected");
			if (expected.isNull()) {
				assertThat(choice).isEmpty();
				return;
			}
			int start = expected.get("start").asInt();
			assertThat(choice).get().extracting(PracticeWindow.Choice::start).isEqualTo(start);
			assertThat(choice.get().candles()).hasSize(expected.get("length").asInt()).first().extracting(Candle::date).isEqualTo(candles.get(start).date());
			assertThat(choice.get().questions()).extracting(q -> q.index() + start)
				.containsExactlyElementsOf(expected.get("questionBars").valueStream().map(JsonNode::asInt).toList());
			// 저장하는 공시는 구간 안의 것만이고, 세션이 다시 계산해도 같은 문제가 나온다
			assertThat(choice.get().news()).allMatch(n -> n.publishedDate().compareTo(choice.get().candles().getFirst().date()) >= 0
				&& n.publishedDate().compareTo(choice.get().candles().getLast().date()) <= 0);
			assertThat(PracticeWindow.questions(choice.get().candles(), choice.get().news())).isEqualTo(choice.get().questions());
		}));
	}
}
