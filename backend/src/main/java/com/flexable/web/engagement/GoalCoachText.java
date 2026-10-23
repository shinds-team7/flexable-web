package com.flexable.web.engagement;

import java.text.Normalizer;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import com.flexable.web.ai.GoalCoachClient.Content;
import com.flexable.web.ai.GoalCoachClient.Content.Step;
import com.flexable.web.engagement.GoalDtos.GoalView;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** AI 문장은 숫자를 직접 포함할 수 없다. 허용된 자리표시자만 검증한 뒤 서버 숫자로 바꾼다. */
final class GoalCoachText {
	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final Pattern PLACEHOLDER = Pattern.compile("\\{([A-Za-z]+)}");
	private static final Pattern FORBIDDEN = Pattern.compile("[A-Za-z%{}]|[일이삼사오육칠팔구십백천만억]+\\s*(원|만|천|억|개월|달|년|퍼센트)"
			+ "|(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\\s*(달|해)");
	private static final List<String> WORDS = List.of("적금", "예금", "펀드", "주식", "종목", "채권", "보험", "청약", "통장", "카드",
			"은행", "증권", "코인", "가상자산", "대출", "리볼빙", "토스", "카카오뱅크", "케이뱅크", "신한", "국민은행", "우리은행", "하나은행",
			"농협", "기업은행", "새마을금고", "우체국", "추천", "권유", "사세요", "파세요", "담으세요", "가입하세요", "투자하세요", "물타기",
			"목표가", "저평가", "지금이 기회", "앞으로 오를", "확실히", "반드시", "보장", "떡상", "폭망", "계좌 연결");

	private GoalCoachText() {
	}

	static Map<String, String> placeholders(GoalView goal) {
		Map<String, String> values = new LinkedHashMap<>();
		var p = goal.progress();
		money(values, "amount", goal.amount());
		money(values, "current", p.current());
		money(values, "remaining", p.remaining());
		money(values, "requiredMonthly", p.requiredMonthly());
		money(values, "pace", goal.seed().pace());
		money(values, "monthlyGap", p.monthlyGap());
		money(values, "dailyGap", p.dailyGap());
		month(values, "dueMonth", goal.dueMonth());
		month(values, "expectedMonth", p.expectedMonth());
		month(values, "thisMonth", p.thisMonth());
		if (p.monthsLeft() >= 0) {
			values.put("monthsLeft", p.monthsLeft() + "개월");
		}
		if (p.expectedMonths() != null) {
			values.put("expectedMonths", p.expectedMonths() + "개월");
		}
		values.put("ratio", p.ratioBp() / 100 + "%");
		goal.scenarios().stream().filter(s -> "EXTEND_6".equals(s.key())).findFirst().ifPresent(s -> {
			money(values, "extendMonthly", s.monthly());
			month(values, "extendMonth", s.reachMonth());
		});
		return values;
	}

	private static void money(Map<String, String> values, String key, Long amount) {
		if (amount != null) {
			values.put(key, String.format(Locale.ROOT, "%,d원", amount));
		}
	}

	private static void month(Map<String, String> values, String key, String month) {
		if (month != null) {
			YearMonth ym = YearMonth.parse(month);
			values.put(key, ym.getYear() + "년 " + ym.getMonthValue() + "월");
		}
	}

	static Content validate(String raw, Map<String, String> values) {
		JsonNode root = JSON.readTree(raw);
		if (!root.isObject() || root.size() != 3 || !root.path("steps").isArray() || root.path("steps").size() != 3) {
			throw new IllegalArgumentException("schema");
		}
		String headline = render(root.path("headline"), 40, values);
		String summary = render(root.path("summary"), 200, values);
		if (summary.codePointCount(0, summary.length()) > 220) {
			throw new IllegalArgumentException("rendered_length");
		}
		List<Step> steps = new ArrayList<>();
		for (JsonNode step : root.path("steps")) {
			if (!step.isObject() || step.size() != 2) {
				throw new IllegalArgumentException("schema");
			}
			steps.add(new Step(render(step.path("title"), 24, values), render(step.path("detail"), 120, values)));
		}
		return new Content(headline, summary, List.copyOf(steps));
	}

	private static String render(JsonNode node, int max, Map<String, String> values) {
		if (!node.isString()) {
			throw new IllegalArgumentException("schema");
		}
		String text = node.asString();
		if (text.isBlank() || text.codePointCount(0, text.length()) > max) {
			throw new IllegalArgumentException("length");
		}
		Matcher matcher = PLACEHOLDER.matcher(text);
		StringBuilder rendered = new StringBuilder();
		while (matcher.find()) {
			String value = values.get(matcher.group(1));
			if (value == null) {
				throw new IllegalArgumentException("placeholder");
			}
			matcher.appendReplacement(rendered, Matcher.quoteReplacement(value));
		}
		matcher.appendTail(rendered);
		String plain = Normalizer.normalize(PLACEHOLDER.matcher(text).replaceAll(""), Normalizer.Form.NFKC);
		String compact = plain.replaceAll("[\\s\\p{Cf}]+", "");
		if (plain.codePoints().anyMatch(Character::isDigit) || FORBIDDEN.matcher(plain).find()
				|| WORDS.stream().anyMatch(word -> compact.contains(word.replace(" ", "")))) {
			throw new IllegalArgumentException("forbidden");
		}
		return rendered.toString();
	}

	static Content fallback(String status, Map<String, String> values) {
		String headline = switch (status) {
			case "REACHED" -> "목표에 닿았어요";
			case "ON_TRACK" -> "지금 속도면 {expectedMonth}에 닿아요";
			case "BEHIND" -> "하루 {dailyGap} 더 남기는 방법을 살펴봐요";
			case "OVERDUE" -> "기한이 지났어요. 새 기한을 정해 봐요";
			default -> "매달 모을 수 있는 돈을 넣어 주세요";
		};
		String summary = switch (status) {
			case "REACHED" -> "지금 모은 돈은 {current}이에요. 모으는 습관을 이어 가요.";
			case "OVERDUE" -> "남은 금액은 {remaining}이에요. {extendMonth}까지라면 매달 {extendMonthly}이 필요해요.";
			default -> "남은 금액은 {remaining}이에요. 기한에 맞추려면 매달 {requiredMonthly}이 필요해요.";
		};
		Content template = new Content(headline, summary, List.of(
				new Step("현재 상황을 점검해요", "모은 돈과 목표 기한이 지금 상황에 맞는지 확인해요."),
				new Step("남길 돈을 정해요", "매달 모을 수 있는 돈을 살피고 하루 예산을 점검해요."),
				new Step("모은 돈을 반영해요", "남긴 돈을 반영한 뒤 목표 진행 상황을 다시 확인해요.")));
		return validate(JSON.writeValueAsString(template), values);
	}
}
