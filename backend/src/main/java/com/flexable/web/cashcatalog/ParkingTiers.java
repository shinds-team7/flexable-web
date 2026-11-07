package com.flexable.web.cashcatalog;

import java.math.BigDecimal;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

/**
 * 공시 원문에서 "구간 안의 금액에만 그 구간 금리를 적용한다"고 적힌 금액 구간표를 읽는다(policies §11, 2단계).
 * 문장 모양이 정해진 규칙에 정확히 맞고 구간이 빈틈없이 이어질 때만 구간표를 돌려주고, 하나라도 어긋나면 null이다.
 * 구간 금리를 전체 잔액에 붙이는지 모호한 상품은 여기서 걸러진다(초과분 표현이나 예시 문장이 있어야 한다).
 */
final class ParkingTiers {

	/** upTo가 null이면 마지막(그 위 전부) 구간. 금액은 원 단위. */
	record Tier(Long upTo, BigDecimal rate) {}

	private static final String AMT = "([\\d,]+)\\s*(억|천만|백만|만)?\\s*원?";
	private static final String RATE = "\\s*[:：]?\\s*(?:연\\s*)?(\\d+(?:\\.\\d+)?)\\s*%";
	private static final Pattern RANGE = Pattern.compile("^" + AMT + "\\s*초과\\s*~\\s*" + AMT + "\\s*이하분?" + RATE);
	private static final Pattern UPPER = Pattern.compile("^" + AMT + "\\s*이하분?" + RATE);
	private static final Pattern OPEN = Pattern.compile("^" + AMT + "\\s*초과분?" + RATE);
	private static final Pattern LEAD = Pattern.compile("^(?:기타사항\\s*:\\s*)?[\\s\\-'’•·※]*(?:[①②③④⑤⑥⑦⑧⑨]|\\d\\))?\\s*");
	private static final Pattern EXAMPLE = Pattern.compile("(예시|예\\))[^\\n]*적용");

	private ParkingTiers() {}

	static List<Tier> parse(String conditions) {
		if (conditions == null) {
			return null;
		}
		record Row(Long lower, Long upper, BigDecimal rate) {}
		List<Row> rows = new ArrayList<>();
		boolean marginalWord = false;
		for (String raw : conditions.replace(' ', ' ').split("\\R")) {
			String line = raw.strip();
			Matcher lead = LEAD.matcher(line);
			if (lead.find()) {
				line = line.substring(lead.end());
			}
			Matcher m;
			if ((m = RANGE.matcher(line)).find()) {
				rows.add(new Row(won(m.group(1), m.group(2)), won(m.group(3), m.group(4)), new BigDecimal(m.group(5))));
			} else if ((m = UPPER.matcher(line)).find()) {
				rows.add(new Row(null, won(m.group(1), m.group(2)), new BigDecimal(m.group(3)))); // 시작 금액은 앞 구간의 끝
			} else if ((m = OPEN.matcher(line)).find()) {
				rows.add(new Row(won(m.group(1), m.group(2)), null, new BigDecimal(m.group(3))));
				marginalWord |= line.contains("초과분");
			}
		}
		if (!marginalWord && !EXAMPLE.matcher(conditions).find()) {
			return null; // 구간 금리를 어디에 붙이는지 원문에 없다
		}
		List<Row> bounded = rows.stream().filter(r -> r.upper() != null).sorted((a, b) -> Long.compare(a.upper(), b.upper())).toList();
		List<Row> open = rows.stream().filter(r -> r.upper() == null).toList();
		if (open.size() != 1 || bounded.isEmpty()) {
			return null;
		}
		List<Tier> tiers = new ArrayList<>();
		long previous = 0;
		for (Row r : bounded) {
			// 위 구간의 끝과 이 구간의 시작이 이어져야 하고, 끝은 시작보다 커야 한다. 첫 구간은 0원에서 시작한다
			if (r.lower() != null && r.lower() != previous || r.upper() <= previous) {
				return null;
			}
			tiers.add(new Tier(r.upper(), r.rate()));
			previous = r.upper();
		}
		if (open.getFirst().lower() != previous) {
			return null;
		}
		tiers.add(new Tier(null, open.getFirst().rate()));
		return List.copyOf(tiers);
	}

	private static long won(String number, String unit) {
		long base = Long.parseLong(number.replace(",", ""));
		long multiplier = unit == null ? 1 : switch (unit) {
			case "억" -> 100_000_000L;
			case "천만" -> 10_000_000L;
			case "백만" -> 1_000_000L;
			default -> 10_000L;
		};
		return Math.multiplyExact(base, multiplier);
	}
}
