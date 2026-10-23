package com.flexable.web.engagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.YearMonth;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.flexable.web.ai.GoalCoachClient.Content;
import com.flexable.web.ai.GoalCoachClient.Content.Step;
import com.flexable.web.engagement.GoalDtos.GoalView;
import com.flexable.web.engagement.GoalDtos.Seed;

import tools.jackson.databind.json.JsonMapper;

class GoalCoachTextTest {
	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final Map<String, String> VALUES = Map.of("requiredMonthly", "45,000원");

	static String raw(String headline) {
		return JSON.writeValueAsString(new Content(headline, "만들기 전에 한 번 점검해요",
				List.of(new Step("점검해요", "남긴 돈을 반영해요"), new Step("살펴봐요", "예산을 살펴봐요"), new Step("확인해요", "기한을 확인해요"))));
	}

	@Test
	void replacesOnlyAllowedPlaceholdersAndAllowsOrdinaryKorean() {
		var result = GoalCoachText.validate(raw("매달 {requiredMonthly}이 필요해요"), VALUES);
		assertThat(result.headline()).isEqualTo("매달 45,000원이 필요해요");
		assertThat(result.summary()).isEqualTo("만들기 전에 한 번 점검해요");
	}

	@Test
	void rejectsUnknownPlaceholdersBracesNumbersNamesAndForbiddenWords() {
		for (String text : List.of("{amount}", "{requiredMonthly", "requiredMonthly}", "{{requiredMonthly}}",
				"999개월", "１２３원", "삼백만원", "세 달", "한 해", "50%", "ETF", "토스", "은행", "주식", "추천해요", "확실히", "계좌 연결", "추 천해요")) {
			assertThatThrownBy(() -> GoalCoachText.validate(raw(text), VALUES)).as(text).isInstanceOf(RuntimeException.class);
		}
	}

	@Test
	void rejectsWrongSchemaLengthsAndStepCount() {
		for (String raw : List.of(raw("가".repeat(41)), "{}", "null", "not-json",
				"{\"headline\":\"점검\",\"summary\":\"점검\",\"steps\":[]}",
				raw("점검").replace("\"headline\":", "\"extra\":true,\"headline\":"),
				raw("점검").replace("남긴 돈을 반영해요", "가".repeat(121)),
				raw("점검").replace("만들기 전에 한 번 점검해요", "가".repeat(201)))) {
			assertThatThrownBy(() -> GoalCoachText.validate(raw, VALUES)).isInstanceOf(RuntimeException.class);
		}
	}

	@Test
	void allFiveFallbacksPassTheSameValidator() {
		YearMonth now = YearMonth.of(2026, 10);
		for (String status : List.of("REACHED", "ON_TRACK", "BEHIND", "NO_PACE", "OVERDUE")) {
			long current = status.equals("REACHED") ? 1000000 : 470000;
			Long pace = status.equals("NO_PACE") ? null : status.equals("BEHIND") ? 1000L : 78000L;
			var calc = GoalMath.calculate(1000000, current, pace, status.equals("OVERDUE") ? now.minusMonths(1) : now.plusMonths(12), now);
			GoalView goal = new GoalView(1, 1, "OTHER", "이름", 1000000,
					(status.equals("OVERDUE") ? now.minusMonths(1) : now.plusMonths(12)).toString(), null, null, null, null,
					new Seed("manual", current, pace, null, null), calc.progress(), calc.scenarios(), calc.checkpoints(), null);
			assertThat(calc.progress().status()).isEqualTo(status);
			assertThat(GoalCoachText.fallback(status, GoalCoachText.placeholders(goal)).steps()).hasSize(3);
		}
	}
}
