package com.flexable.web.goalscenario;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.regex.Pattern;

/** 제안기가 낸 조합과 그 검증(policies §7-6). 제안은 유형 이름을 문자열로 받아 목록 밖 유형도 검사한다. */
final class Proposals {

	/** 제안기가 낸 시나리오 한 개. mix의 키는 유형 이름, 값은 비중(%). */
	record Draft(String id, String title, String summary, String explanation, Map<String, Integer> mix) {
	}

	/** 검증을 통과한 시나리오. mix는 비중이 0보다 큰 유형만, ProductType 순서. */
	record Plan(String id, String title, String summary, String explanation, Map<ProductType, Integer> mix) {
	}

	private static final Pattern DIGIT = Pattern.compile("[0-9]");
	private static final List<String> BANNED = List.of("확실", "보장", "무조건");

	/** AI 연결 전·검증 실패 시 쓰는 데모 조합. 문구에도 숫자·보장 표현을 넣지 않는다. */
	static final List<Draft> DEMO = List.of(
			new Draft("steady", "차근차근 모으기", "이자가 정해진 상품만",
					"원금이 줄어들 일 없이 목표에 닿는 조합이에요. 적금으로 매달 꾸준히 모으고, 급하게 꺼낼 일에 대비해 일부는 CMA에 둬요. 매달 넣는 돈은 세 조합 중 가장 많아요.",
					ordered("SAVINGS", 70, "CMA", 30)),
			new Draft("spread", "나눠서 키우기", "저축 절반과 지수 ETF·주식",
					"저축 몫으로 바닥을 받치고, 나머지는 국내·미국 지수 ETF와 주식에 나눠 넣은 조합이에요. 한 시장이 부진해도 다른 쪽이 메워 줄 수 있게 나눴어요. 기한이 다가오면 투자 몫을 적금·CMA로 옮기는 것도 방법이에요.",
					ordered("SAVINGS", 40, "CMA", 10, "KR_INDEX_ETF", 20, "US_INDEX_ETF", 20, "KOSPI_TOP5", 10)),
			new Draft("bold", "적극적으로 키우기", "지수 ETF·주식 중심",
					"지수 ETF와 주식 비중을 크게 높여, 같은 목표를 더 적은 월 금액으로 노리는 조합이에요. 잘 안 풀리면 목표에 많이 못 미칠 수 있어서, 중간에 크게 줄어도 기다릴 수 있는 돈일 때만 고려해 보세요.",
					ordered("SAVINGS", 10, "CMA", 10, "KR_INDEX_ETF", 20, "US_INDEX_ETF", 30, "KOSPI_TOP5", 30)));

	private Proposals() {
	}

	private static Map<String, Integer> ordered(Object... kv) {
		Map<String, Integer> m = new LinkedHashMap<>();
		for (int i = 0; i < kv.length; i += 2) {
			m.put((String) kv[i], (Integer) kv[i + 1]);
		}
		return m;
	}

	/** 규칙을 하나라도 어기면 빈 값(제안 전체를 버린다). */
	static Optional<List<Plan>> validate(List<Draft> drafts) {
		if (drafts == null || drafts.size() < 2 || drafts.size() > 3) {
			return Optional.empty();
		}
		List<Plan> out = new ArrayList<>();
		Set<String> ids = new HashSet<>();
		for (Draft d : drafts) {
			if (d == null || d.mix() == null || d.id() == null || d.id().isBlank() || !ids.add(d.id())
					|| !text(d.title(), 20) || !text(d.summary(), 40) || !text(d.explanation(), 300)) {
				return Optional.empty();
			}
			Map<ProductType, Integer> mix = new EnumMap<>(ProductType.class);
			int sum = 0;
			for (var e : d.mix().entrySet()) {
				ProductType t = type(e.getKey());
				Integer ratio = e.getValue();
				if (t == null || ratio == null || ratio < 0 || ratio > 100 || mix.containsKey(t)) {
					return Optional.empty();
				}
				sum += ratio;
				mix.put(t, ratio);
			}
			mix.values().removeIf(r -> r == 0);
			if (sum != 100 || mix.isEmpty()) {
				return Optional.empty();
			}
			out.add(new Plan(d.id(), d.title().strip(), d.summary().strip(), d.explanation().strip(), mix));
		}
		return Optional.of(out);
	}

	private static boolean text(String s, int max) {
		if (s == null) {
			return false;
		}
		String t = s.strip();
		return !t.isEmpty() && t.length() <= max && !DIGIT.matcher(t).find() && BANNED.stream().noneMatch(t::contains);
	}

	private static ProductType type(String name) {
		for (ProductType t : ProductType.values()) {
			if (t.name().equals(name)) {
				return t;
			}
		}
		return null;
	}
}
