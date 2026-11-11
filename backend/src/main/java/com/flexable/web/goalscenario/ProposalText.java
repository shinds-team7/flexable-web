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
 * 숫자는 서버가 확인할 수 있는 것만 허용한다: 상품·지수 이름 속 숫자, 기한 안의 기간, AI에게 보낸 목표 금액·월 납입 가능액·금리·세율·유형별 통계와
 * 통계 기간("지난 60개월"), 그 시나리오의 비중과 같은 %, 합쳤다는 말이나 유형 이름 나열과 함께 쓴 비중의 합, 다섯 이하의 종목·가지 수, 금융권 구분("1금융권").
 * 그 밖의 금액·%·배수·횟수는 AI가 새로 만든 숫자로 보고 막는다.
 * 보장 표현은 단정만 막고 부정문("보장되지 않아요")은 허용한다.
 * 월 납입 가능액으로 충분하다는 단정도 막는다. 필요 월 금액은 제안을 받은 뒤 서버가 계산해 AI는 알 수 없다(#400 리뷰).
 */
final class ProposalText {

	/**
	 * AI에게 보낸 사실. 문구 속 숫자를 이 값과 대조한다.
	 * percents는 표기한 값과 같아야 한다. stats(유형별 통계를 %로 바꾼 절댓값)는 문맥까지 본다(allowedStat).
	 */
	record Facts(long targetAmount, long monthlyBudget, int months, Set<String> names, List<BigDecimal> percents,
			Map<StatKind, List<BigDecimal>> stats) {
		static final Facts NONE = new Facts(0, 0, Set.of(), List.of());

		/** monthlyBudget은 AI에게 보낸 월 납입 가능액, 보내지 않았으면 0. */
		Facts(long targetAmount, int months, Set<String> names, List<BigDecimal> percents, Map<StatKind, List<BigDecimal>> stats) {
			this(targetAmount, 0, months, names, percents, stats);
		}

		Facts(long targetAmount, int months, Set<String> names, List<BigDecimal> percents) {
			this(targetAmount, months, names, percents, Map.of());
		}

		/** AI에게 보낸 금액(목표 금액·월 납입 가능액)과 같은지. */
		boolean sentAmount(BigDecimal won) {
			return (targetAmount != 0 && won.compareTo(BigDecimal.valueOf(targetAmount)) == 0)
					|| (monthlyBudget != 0 && won.compareTo(BigDecimal.valueOf(monthlyBudget)) == 0);
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

	/** 비중을 합쳤다는 뜻의 말과 그 말을 찾는 범위. */
	private static final List<String> SUM_WORDS = List.of("나머지", "합쳐", "합해", "합계", "합친", "더해", "더한", "모두", "전체");
	private static final int SUM_WORD_RANGE = 12;
	/** 합계와 함께 있으면 비중이 아니라 수익·확률·예상으로 쓴 것으로 본다. */
	private static final List<String> NOT_MIX_WORDS = List.of("수익", "이익", "확률", "가능성", "달성률", "상승", "성장", "예상", "기대", "전망");

	/** 비중 합 앞에 나열할 수 있는 유형 이름(띄어쓰기를 지운 꼴). 긴 이름부터 찾고, 찾은 자리는 지워 짧은 이름이 다시 걸리지 않게 한다(#398). */
	private static final List<Map.Entry<String, Set<ProductType>>> TYPE_NAMES = typeNames();
	/** 유형 이름 나열을 찾는 범위(숫자 바로 앞, 띄어쓰기를 지운 글자 수). */
	private static final int TYPE_NAME_RANGE = 20;
	/** 정수 통계에서 종류 단어를 찾는 범위(숫자 바로 앞, 띄어쓰기를 지운 글자 수). */
	private static final int STAT_WORD_RANGE = 8;
	/** 상품 설명에 쓰는 금융권 구분. 숫자 검사 전에 지운다(#398). */
	private static final Pattern BANK_TIER = Pattern.compile("제?\\s*[12]\\s*금융권");

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
			"이안", "은안", "할수없", "될수없", "되는건아니", "되는것은아니", "되는게아니", "하는건아니", "하는것은아니", "된건아니",
			// #398: 맞는 위험 안내인데 걸리던 부정문
			"받지못", "받지않", "받을수없", "해주지않", "할수는없", "될수는없", "된게아니", "된것이아니", "되는것이아니", "되지도않", "하지도않",
			"은되지않", "도없", "되는상품이아니", "형상품이아니", "하다고할수없", "하다고볼수없" };

	/**
	 * 월 납입 가능액을 채운다는 단정. 띄어쓰기를 지운 문장과 비교하고, 같은 문장이 가능액을 가리킬 때만 본다(#400 리뷰).
	 * "매달 50만 원으로 해 볼 수 있어요"처럼 참고만 하는 문장은 허용한다.
	 */
	private static final List<String> BUDGET_CLAIMS = List.of("충분", "넉넉", "여유", "감당", "안에들", "안에서", "안으로", "넘지않", "맞출수있");

	private ProposalText() {
	}

	/** 해설에서 규칙에 걸려 지운 문장과 이유 코드. */
	record Removed(String problem, String sentence) {
	}

	/** 걸린 문장을 지운 해설과 지운 문장들. 전부 걸리면 text가 빈 문자열이다. */
	record Cleaned(String text, List<Removed> removed) {
	}

	/** 유형별 비중을 알면 유형 이름 나열과 함께 쓴 비중 합도 확인한다. */
	static Cleaned clean(String text, Facts facts, Map<ProductType, Integer> mix) {
		return clean(text, facts, mix.values(), mix);
	}

	static Cleaned clean(String text, Facts facts, Collection<Integer> mix) {
		return clean(text, facts, mix, Map.of());
	}

	/** 문장별로 검사해 걸린 문장만 지운다. 문단 줄바꿈은 유지하고, 문장이 빠져 남은 빈 줄은 한 줄로 줄인다. */
	private static Cleaned clean(String text, Facts facts, Collection<Integer> mix, Map<ProductType, Integer> typed) {
		StringBuilder kept = new StringBuilder();
		List<Removed> removed = new java.util.ArrayList<>();
		int start = 0;
		for (int i = 0; i < text.length(); i++) {
			if (endsSentence(text, i) || i == text.length() - 1) {
				String piece = text.substring(start, i + 1);
				start = i + 1;
				String problem = piece.isBlank() ? null : problem(piece.strip(), facts, mix, typed);
				if (problem == null) {
					kept.append(piece);
				}
				else {
					removed.add(new Removed(problem, piece.strip()));
				}
			}
		}
		String out = kept.toString().replaceAll("[ \\t]*\\n[ \\t\\n]*\\n[ \\t]*", "\n\n").strip();
		return new Cleaned(out, removed);
	}

	static String problem(String text, Facts facts, Map<ProductType, Integer> mix) {
		return problem(text, facts, mix.values(), mix);
	}

	static String problem(String text, Facts facts, Collection<Integer> mix) {
		return problem(text, facts, mix, Map.of());
	}

	/** 규칙을 어기면 이유 코드(TEXT_NUMBER·TEXT_ASSERTION·TEXT_BUDGET), 지키면 null. mix는 그 시나리오의 비중, typed는 유형별 비중(모르면 빈 값). */
	private static String problem(String text, Facts facts, Collection<Integer> mix, Map<ProductType, Integer> typed) {
		if (asserts(text)) {
			return "TEXT_ASSERTION";
		}
		if (claimsBudget(text, facts)) {
			return "TEXT_BUDGET";
		}
		return numbersOk(text, facts, mix, typed) ? null : "TEXT_NUMBER";
	}

	/** 월 납입 가능액(낱말 "가능액" 또는 AI에게 보낸 가능액과 같은 금액)을 가리키며 충분하다·안에 든다고 단정하는지. */
	static boolean claimsBudget(String text, Facts facts) {
		String t = text.replaceAll("\\s+", "");
		if (BUDGET_CLAIMS.stream().noneMatch(t::contains)) {
			return false;
		}
		return text.contains("가능액") || mentionsAmount(text, facts.monthlyBudget());
	}

	/** 문장에 amount원과 같은 금액이 있는지(표기는 numbersOk와 같다). amount가 0이면 false. */
	private static boolean mentionsAmount(String text, long amount) {
		if (amount == 0) {
			return false;
		}
		Matcher m = NUMBER.matcher(text);
		int from = 0;
		while (m.find(from)) {
			from = m.end();
			if (MONEY_UNIT.matcher(text.substring(m.end())).find()) {
				int[] end = { m.start() };
				BigDecimal won = money(text, end);
				if (won != null && won.compareTo(BigDecimal.valueOf(amount)) == 0) {
					return true;
				}
				from = Math.max(from, end[0]);
			}
		}
		return false;
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

	static boolean numbersOk(String text, Facts facts, Collection<Integer> mix, Map<ProductType, Integer> typed) {
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
		t = BANK_TIER.matcher(t).replaceAll(" ");
		Matcher m = NUMBER.matcher(t);
		int from = 0;
		while (m.find(from)) {
			BigDecimal n = new BigDecimal(m.group().replace(",", ""));
			String rest = t.substring(m.end());
			Matcher unit;
			if ((unit = PERCENT_UNIT.matcher(rest)).find()) {
				if (!allowedPercent(n, facts, mix, t, m.start()) &&!allowedStat(n, facts, t, m.start(), m.end()) && !allowedMixSum(n, mix, t, m.start(), m.end())
						&& !allowedTypeSum(n, typed, t, m.start(), m.end())) {
					return false;
				}
				from = m.end() + unit.end();
			}
			else if (MONEY_UNIT.matcher(rest).find()) {
				int[] end = { m.start() };
				BigDecimal won = money(t, end);
				if (won == null || !facts.sentAmount(won)) {
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

	/**
	 * 보낸 금리·세율과 같은 %, 또는 그 시나리오의 비중과 같은 %. 비중 값은 바로 앞이 "연"이거나 같은 문장에 수익 예상을 뜻하는 말이 있으면
	 * 비중이 아니라 지어낸 수익률로 본다("반도체 수요가 커지면 연 10% 수익이 기대돼요", #398 전망 허용).
	 */
	private static boolean allowedPercent(BigDecimal n, Facts facts, Collection<Integer> mix, String t, int start) {
		if (n.signum() > 0 && n.scale() == 0 && n.compareTo(BigDecimal.valueOf(100)) <= 0 && mix.contains(n.intValue())) {
			int from = sentenceStart(t, start);
			String before = t.substring(from, start).replaceAll("\\s+", "");
			String compact = t.substring(from, sentenceEnd(t, start)).replaceAll("\\s+", "");
			if (!before.endsWith("연") && FORECAST_WORDS.stream().noneMatch(compact::contains)) {
				return true;
			}
		}
		return facts.percents().stream().anyMatch(p -> p.compareTo(n) == 0);
	}

	/**
	 * 통계 수치는 소수 첫째·둘째 자리로 쓰거나 정수로 반올림해 쓴다. 같은 문장에서 가장 가까운 종류 단어의 값과 반올림해 같아야 하고,
	 * 그 문장에 수익 예상을 뜻하는 말이 없어야 한다. 정수는 지어낸 "연 7% 수익"이 통계와 우연히 맞을 수 있어, 종류 단어가 숫자 바로 앞
	 * (STAT_WORD_RANGE자 안)에 있고 숫자 바로 앞이 "연"이 아닐 때만 허용한다(#398). 어느 상품의 값인지는 구분하지 못한다.
	 */
	private static boolean allowedStat(BigDecimal n, Facts facts, String t, int start, int end) {
		if (n.scale() > 2) {
			return false;
		}
		int from = sentenceStart(t, start);
		if (n.scale() == 0) {
			String before = t.substring(from, start).replaceAll("\\s+", "");
			String near = before.substring(Math.max(0, before.length() - STAT_WORD_RANGE));
			if (before.endsWith("연") || java.util.Arrays.stream(StatKind.values()).noneMatch(k -> near.contains(k.word))) {
				return false;
			}
		}
		String sentence = t.substring(from, sentenceEnd(t, end));
		String compact = sentence.replaceAll("\\s+", "");
		if (FORECAST_WORDS.stream().anyMatch(compact::contains)) {
			return false;
		}
		StatKind kind = nearestKind(sentence, start - from, end - from);
		return kind != null && facts.stats().getOrDefault(kind, List.of()).stream()
			.anyMatch(s -> s.setScale(n.scale(), RoundingMode.HALF_UP).compareTo(n) == 0);
	}

	/**
	 * 그 시나리오의 비중을 두 개 이상 더한 값. 합쳤다는 말이 숫자 바로 앞(SUM_WORD_RANGE자 안)에 있어야 한다. 문장 처음부터 숫자 바로 뒤까지
	 * 수익·확률·예상을 뜻하는 말이 없어야 하고, 숫자 바로 앞이 "연"이면 안 된다("나머지 70%"는 통과, "예상 수익은 모두 합쳐 연 80%"는 막힘).
	 * 숫자에서 먼 뒤쪽은 보지 않는다("나머지 70%는 지수 ETF에 나눠 성장 가능성을 노려요"는 비중을 말한 문장이다).
	 */
	private static boolean allowedMixSum(BigDecimal n, Collection<Integer> mix, String t, int start, int end) {
		if (n.scale() != 0 || !isMixSum(n.intValue(), mix)) {
			return false;
		}
		int from = sentenceStart(t, start);
		String near = t.substring(Math.max(from, start - SUM_WORD_RANGE), start);
		if (SUM_WORDS.stream().noneMatch(near::contains) || near.stripTrailing().endsWith("연")) {
			return false;
		}
		String around = t.substring(from, start) + t.substring(end, Math.min(sentenceEnd(t, end), end + SUM_WORD_RANGE));
		return NOT_MIX_WORDS.stream().noneMatch(around::contains);
	}

	/**
	 * 유형 이름을 나열한 뒤 쓴 비중 합("적금·CMA 80%", "국내·미국 지수 ETF 40%"). 숫자 바로 앞(TYPE_NAME_RANGE자 안)에 이 시나리오의 유형이
	 * 두 개 이상 있고 그 비중의 합이 숫자와 같아야 한다. 수익·확률·예상을 뜻하는 말과 "연"은 allowedMixSum과 같이 막는다(#398).
	 */
	private static boolean allowedTypeSum(BigDecimal n, Map<ProductType, Integer> typed, String t, int start, int end) {
		if (typed.isEmpty() || n.scale() != 0) {
			return false;
		}
		int from = sentenceStart(t, start);
		String before = t.substring(from, start).replaceAll("\\s+", "");
		if (before.endsWith("연")) {
			return false;
		}
		// 앞 숫자에 붙은 이름은 세지 않는다("적금 50%와 CMA·지수 ETF 50%"에서 적금은 뒤 숫자의 나열이 아니다)
		int cut = before.length();
		while (cut > 0 && !Character.isDigit(before.charAt(cut - 1)) && before.charAt(cut - 1) != '%') {
			cut--;
		}
		String near = before.substring(Math.max(cut, before.length() - TYPE_NAME_RANGE));
		Set<ProductType> named = java.util.EnumSet.noneOf(ProductType.class);
		for (var e : TYPE_NAMES) {
			if (near.contains(e.getKey())) {
				named.addAll(e.getValue());
				near = near.replace(e.getKey(), " ");
			}
		}
		if (named.size() < 2 || named.stream().mapToInt(p -> typed.getOrDefault(p, 0)).sum() != n.intValue()) {
			return false;
		}
		String around = t.substring(from, start) + t.substring(end, Math.min(sentenceEnd(t, end), end + SUM_WORD_RANGE));
		return NOT_MIX_WORDS.stream().noneMatch(around::contains);
	}

	private static List<Map.Entry<String, Set<ProductType>>> typeNames() {
		Set<ProductType> kr = Set.of(ProductType.KR_INDEX_ETF);
		Set<ProductType> us = Set.of(ProductType.US_INDEX_ETF);
		Set<ProductType> both = Set.of(ProductType.KR_INDEX_ETF, ProductType.US_INDEX_ETF);
		Set<ProductType> kospi = Set.of(ProductType.KOSPI_TOP5);
		Map<String, Set<ProductType>> names = new java.util.LinkedHashMap<>();
		for (String n : List.of("국내·미국대표지수ETF", "국내·미국지수ETF", "국내·미국ETF", "국내와미국대표지수ETF", "국내와미국지수ETF", "국내와미국ETF", "지수ETF")) {
			names.put(n, both);
		}
		for (String n : List.of("국내대표지수ETF", "국내지수ETF", "국내ETF")) {
			names.put(n, kr);
		}
		for (String n : List.of("미국대표지수ETF", "미국지수ETF", "미국ETF")) {
			names.put(n, us);
		}
		for (String n : List.of("코스피대형주", "코스피주식", "코스피상위")) {
			names.put(n, kospi);
		}
		names.put("적금", Set.of(ProductType.SAVINGS));
		names.put("CMA", Set.of(ProductType.CMA));
		return names.entrySet().stream()
			.sorted(Comparator.comparingInt((Map.Entry<String, Set<ProductType>> e) -> e.getKey().length()).reversed())
			.map(e -> Map.entry(e.getKey(), e.getValue())).toList();
	}

	private static boolean isMixSum(int n, Collection<Integer> mix) {
		List<Integer> values = List.copyOf(mix);
		for (int bits = 1; bits < 1 << values.size(); bits++) {
			if (Integer.bitCount(bits) < 2) {
				continue;
			}
			int sum = 0;
			for (int i = 0; i < values.size(); i++) {
				if ((bits >> i & 1) == 1) {
					sum += values.get(i);
				}
			}
			if (sum == n) {
				return true;
			}
		}
		return false;
	}

	/**
	 * 숫자가 어느 통계인지: 숫자 앞에 있는 종류 단어 중 가장 가까운 것, 앞에 없으면 뒤에 있는 단어 중 가장 가까운 것.
	 * 이름을 값 앞에 쓰는 표기("월 평균 수익률은 2.11%이고 변동폭은 10.53%예요")에서 뒤 단어가 더 가까워도 앞 단어를 따른다(PR #401 리뷰).
	 */
	private static StatKind nearestKind(String sentence, int start, int end) {
		StatKind before = null;
		StatKind after = null;
		int bestBefore = Integer.MAX_VALUE;
		int bestAfter = Integer.MAX_VALUE;
		for (StatKind kind : StatKind.values()) {
			for (int i = sentence.indexOf(kind.word); i >= 0; i = sentence.indexOf(kind.word, i + 1)) {
				if (i < start) {
					int distance = start - (i + kind.word.length());
					if (distance < bestBefore) {
						bestBefore = distance;
						before = kind;
					}
				}
				else if (i - end < bestAfter) {
					bestAfter = i - end;
					after = kind;
				}
			}
		}
		return before != null ? before : after;
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
