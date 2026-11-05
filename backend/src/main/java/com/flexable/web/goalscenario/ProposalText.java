package com.flexable.web.goalscenario;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.Collection;
import java.util.Comparator;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 제안 문구(제목·요약·해설)의 숫자·보장 표현 검사(policies §7-6).
 * 숫자는 서버가 확인할 수 있는 것만 허용한다: 상품·지수 이름 속 숫자, 기한 안의 기간, AI에게 보낸 목표 금액·금리·세율·유형별 통계와
 * 통계 기간("지난 60개월"), 그 시나리오의 비중과 같은 %, 다섯 이하의 종목·가지 수. 그 밖의 금액·%·배수·횟수는 AI가 새로 만든 숫자로 보고 막는다.
 * 보장 표현은 단정만 막고 부정문("보장되지 않아요")은 허용한다.
 */
final class ProposalText {

	/**
	 * AI에게 보낸 사실. 문구 속 숫자를 이 값과 대조한다.
	 * percents는 표기한 값과 같아야 한다. stats(유형별 통계를 %로 바꾼 절댓값)는 문맥까지 본다(allowedStat).
	 */
	record Facts(long targetAmount, int months, Set<String> names, List<BigDecimal> percents, Map<StatKind, List<BigDecimal>> stats) {
		static final Facts NONE = new Facts(0, 0, Set.of(), List.of());

		Facts(long targetAmount, int months, Set<String> names, List<BigDecimal> percents) {
			this(targetAmount, months, names, percents, Map.of());
		}
	}

	/** 통계의 종류와 문구에서 그 뜻을 나타내는 단어. */
	enum StatKind {
		MEAN("평균"), VOLATILITY("변동"), DRAWDOWN("하락");

		final String word;

		StatKind(String word) {
			this.word = word;
		}
	}

	/** 통계 수치와 같은 문장에 있으면 과거 값을 수익 예상처럼 쓴 것으로 본다. 띄어쓰기를 지운 문장과 비교한다. */
	private static final List<String> FORECAST_WORDS = List.of("기대", "예상", "전망", "노려", "노리", "목표수익");

	/** 통계의 자료 기간. 기한 밖이어도 지난 기간이면 허용한다("60개월 뒤"처럼 앞으로의 기간은 막는다). */
	private static final Pattern STAT_PERIOD = Pattern.compile("(?:지난|최근|과거)\\s*(?:60\\s*개월|5\\s*년)");

	/** 숫자가 들어간 대표 지수 이름. 상품 이름과 함께 숫자 검사 전에 지운다. */
	private static final List<String> INDEX_NAMES = List.of("S&P 500", "S&P500", "코스피 200", "코스피200", "KOSPI 200", "KOSPI200",
			"나스닥 100", "나스닥100", "NASDAQ 100", "NASDAQ100");
	private static final Pattern NUMBER = Pattern.compile("\\d{1,3}(?:,\\d{3})+(?:\\.\\d+)?|\\d+(?:\\.\\d+)?");
	private static final Pattern MONEY_UNIT = Pattern.compile("^\\s*(억|천만|백만|만|천|원)");
	private static final Pattern PERCENT_UNIT = Pattern.compile("^\\s*(%|퍼센트|프로)");
	private static final Pattern DURATION_UNIT = Pattern.compile("^\\s*(년|개월|달)");
	private static final Pattern COUNT_UNIT = Pattern.compile("^\\s*(종목|개|가지)");
	/** "보장"·"확실" 바로 뒤(띄어쓰기 무시)에 오면 부정문으로 본다. */
	private static final String[] NEGATIONS = { "되지않", "하지않", "되지는않", "하지는않", "되진않", "하진않", "치않", "되지못", "하지못", "이없", "은없", "는없",
			"이안", "은안", "할수없", "될수없", "되는건아니", "되는것은아니", "되는게아니", "하는건아니", "하는것은아니", "된건아니" };

	private ProposalText() {
	}

	/** 규칙을 어기면 이유 코드(TEXT_NUMBER·TEXT_ASSERTION), 지키면 null. mix는 그 시나리오의 비중. */
	static String problem(String text, Facts facts, Collection<Integer> mix) {
		if (asserts(text)) {
			return "TEXT_ASSERTION";
		}
		return numbersOk(text, facts, mix) ? null : "TEXT_NUMBER";
	}

	/** "무조건"·"원금 보장"·"보장돼요"·"확실히" 같은 단정. "보장되지 않아요"·"불확실"은 허용. */
	static boolean asserts(String text) {
		if (text.contains("무조건")) {
			return true;
		}
		String t = text.replaceAll("\\s+", "");
		return unnegated(t, "보장", false) || unnegated(t, "확실", true);
	}

	private static boolean unnegated(String t, String word, boolean allowUn) {
		for (int i = t.indexOf(word); i >= 0; i = t.indexOf(word, i + 1)) {
			if (allowUn && i > 0 && t.charAt(i - 1) == '불') {
				continue;
			}
			String rest = t.substring(i + word.length());
			boolean negated = false;
			for (String n : NEGATIONS) {
				if (rest.startsWith(n)) {
					negated = true;
					break;
				}
			}
			if (!negated) {
				return true;
			}
		}
		return false;
	}

	static boolean numbersOk(String text, Facts facts, Collection<Integer> mix) {
		String t = text;
		// 긴 이름부터 지워 "TIGER 미국S&P500"이 "S&P500"보다 먼저 빠지게 한다
		List<String> names = java.util.stream.Stream.concat(facts.names().stream(), INDEX_NAMES.stream())
			.filter(n -> n != null && !n.isBlank()).sorted(Comparator.comparingInt(String::length).reversed()).toList();
		for (String n : names) {
			t = t.replace(n, " ");
		}
		if (!facts.stats().isEmpty()) {
			t = STAT_PERIOD.matcher(t).replaceAll(" ");
		}
		Matcher m = NUMBER.matcher(t);
		int from = 0;
		while (m.find(from)) {
			BigDecimal n = new BigDecimal(m.group().replace(",", ""));
			String rest = t.substring(m.end());
			Matcher unit;
			if ((unit = PERCENT_UNIT.matcher(rest)).find()) {
				if (!allowedPercent(n, facts, mix) && !allowedStat(n, facts, t, m.start(), m.end())) {
					return false;
				}
				from = m.end() + unit.end();
			}
			else if (MONEY_UNIT.matcher(rest).find()) {
				int[] end = { m.start() };
				BigDecimal won = money(t, end);
				if (won == null || won.compareTo(BigDecimal.valueOf(facts.targetAmount())) != 0 || facts.targetAmount() == 0) {
					return false;
				}
				from = end[0];
			}
			else if ((unit = DURATION_UNIT.matcher(rest)).find()) {
				BigDecimal months = unit.group(1).equals("년") ? n.multiply(BigDecimal.valueOf(12)) : n;
				if (n.scale() > 0 || months.signum() <= 0 || months.compareTo(BigDecimal.valueOf(facts.months())) > 0) {
					return false;
				}
				from = m.end() + unit.end();
			}
			else if ((unit = COUNT_UNIT.matcher(rest)).find()) {
				if (n.scale() > 0 || n.signum() <= 0 || n.compareTo(BigDecimal.valueOf(5)) > 0) {
					return false;
				}
				from = m.end() + unit.end();
			}
			else {
				// 단위가 없거나 배·번·회 등: 서버가 확인할 수 없는 숫자
				return false;
			}
		}
		return true;
	}

	private static boolean allowedPercent(BigDecimal n, Facts facts, Collection<Integer> mix) {
		if (n.signum() > 0 && n.scale() == 0 && n.compareTo(BigDecimal.valueOf(100)) <= 0 && mix.contains(n.intValue())) {
			return true;
		}
		return facts.percents().stream().anyMatch(p -> p.compareTo(n) == 0);
	}

	/**
	 * 통계 수치는 소수 첫째·둘째 자리로 쓰고(정수까지 허용하면 지어낸 "연 7% 수익"이 통계와 우연히 맞는다), 같은 문장에서 가장 가까운
	 * 종류 단어의 값과 반올림해 같아야 하며, 그 문장에 수익 예상을 뜻하는 말이 없어야 한다. 어느 상품의 값인지는 구분하지 못한다.
	 */
	private static boolean allowedStat(BigDecimal n, Facts facts, String t, int start, int end) {
		if (n.scale() < 1 || n.scale() > 2) {
			return false;
		}
		int from = sentenceStart(t, start);
		String sentence = t.substring(from, sentenceEnd(t, end));
		String compact = sentence.replaceAll("\\s+", "");
		if (FORECAST_WORDS.stream().anyMatch(compact::contains)) {
			return false;
		}
		StatKind kind = nearestKind(sentence, start - from, end - from);
		return kind != null && facts.stats().getOrDefault(kind, List.of()).stream()
			.anyMatch(s -> s.setScale(n.scale(), RoundingMode.HALF_UP).compareTo(n) == 0);
	}

	private static StatKind nearestKind(String sentence, int start, int end) {
		StatKind nearest = null;
		int best = Integer.MAX_VALUE;
		for (StatKind kind : StatKind.values()) {
			for (int i = sentence.indexOf(kind.word); i >= 0; i = sentence.indexOf(kind.word, i + 1)) {
				int distance = i < start ? start - (i + kind.word.length()) : i - end;
				if (distance < best) {
					best = distance;
					nearest = kind;
				}
			}
		}
		return nearest;
	}

	private static int sentenceStart(String t, int pos) {
		for (int i = pos - 1; i >= 0; i--) {
			if (endsSentence(t, i)) {
				return i + 1;
			}
		}
		return 0;
	}

	private static int sentenceEnd(String t, int pos) {
		for (int i = pos; i < t.length(); i++) {
			if (endsSentence(t, i)) {
				return i;
			}
		}
		return t.length();
	}

	/** 소수점과 구분하려고 마침표는 뒤가 공백이거나 글 끝일 때만 문장 끝으로 본다. */
	private static boolean endsSentence(String t, int i) {
		char c = t.charAt(i);
		if (c == '\n' || c == '!' || c == '?') {
			return true;
		}
		return c == '.' && (i + 1 == t.length() || Character.isWhitespace(t.charAt(i + 1)));
	}

	private static final Pattern MONEY_PART = Pattern.compile("\\s*(\\d{1,3}(?:,\\d{3})+|\\d+)(?:\\.(\\d+))?\\s*(억|천만|백만|만|천)?");
	private static final Pattern WON = Pattern.compile("\\s*원");

	/** "1억 5,000만 원"·"1500만원"·"15,000,000원"을 원 단위로. end[0]은 시작 위치를 받아 끝 위치로 바뀐다. 금액이 아니면 null. */
	private static BigDecimal money(String t, int[] end) {
		BigDecimal total = BigDecimal.ZERO;
		int pos = end[0];
		boolean any = false;
		while (pos < t.length()) {
			Matcher part = MONEY_PART.matcher(t).region(pos, t.length());
			if (!part.lookingAt()) {
				break;
			}
			BigDecimal n = new BigDecimal(part.group(1).replace(",", "") + (part.group(2) == null ? "" : "." + part.group(2)));
			String unit = part.group(3);
			if (unit == null) {
				// 단위 없는 숫자는 바로 뒤에 "원"이 올 때만 금액의 끝자리다
				Matcher won = WON.matcher(t).region(part.end(), t.length());
				if (!won.lookingAt()) {
					break;
				}
				end[0] = won.end();
				return total.add(n);
			}
			total = total.add(n.multiply(switch (unit) {
				case "억" -> BigDecimal.valueOf(100_000_000L);
				case "천만" -> BigDecimal.valueOf(10_000_000L);
				case "백만" -> BigDecimal.valueOf(1_000_000L);
				case "만" -> BigDecimal.valueOf(10_000L);
				default -> BigDecimal.valueOf(1_000L);
			}));
			pos = part.end();
			any = true;
		}
		if (!any) {
			return null;
		}
		Matcher won = WON.matcher(t).region(pos, t.length());
		end[0] = won.lookingAt() ? won.end() : pos;
		return total;
	}
}
