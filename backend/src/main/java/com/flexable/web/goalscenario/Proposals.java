package com.flexable.web.goalscenario;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.HashSet;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

/** 제안기가 낸 조합과 그 검증(policies §7-6). 제안은 유형 이름을 문자열로 받아 목록 밖 유형도 검사한다. */
final class Proposals {

	/** 제안기가 낸 시나리오 한 개. mix의 키는 유형 이름, 값은 비중(%). */
	record Draft(String id, String title, String summary, String explanation, Map<String, Integer> mix) {
	}

	/** 검증을 통과한 시나리오. mix는 비중이 0보다 큰 유형만, ProductType 순서. */
	record Plan(String id, String title, String summary, String explanation, Map<ProductType, Integer> mix) {
	}

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

	/** 규칙을 하나라도 어기면 빈 값(제안 전체를 버린다). 대조할 사실이 없으므로 문구에 숫자를 쓰면 걸린다(데모 조합용). */
	static Optional<List<Plan>> validate(List<Draft> drafts) {
		return Optional.ofNullable(check(drafts, ProposalText.Facts.NONE).plans());
	}

	/**
	 * 검사 결과. 통과하면 plans, 걸리면 problem(어긴 규칙·몇 번째 시나리오·칸, 예: "TEXT_NUMBER #2.explanation").
	 * problem에는 AI가 쓴 문구를 넣지 않는다(로그용).
	 */
	record Checked(List<Plan> plans, String problem, String rejectedText) {
		static Checked fail(String problem) {
			return new Checked(null, problem, null);
		}

		static Checked fail(String problem, String rejectedText) {
			return new Checked(null, problem, rejectedText);
		}

		/** 로그 한 줄. includeText면 걸린 칸의 문구도 붙인다(제어 문자는 공백으로, 최대 300자). */
		String logLine(boolean includeText) {
			if (!includeText || rejectedText == null || rejectedText.isBlank()) {
				return problem;
			}
			String clean = rejectedText.replaceAll("\\p{Cntrl}", " ").strip();
			return problem + " \"" + (clean.length() > 300 ? clean.substring(0, 300) : clean) + "\"";
		}
	}

	/** facts는 AI에게 보낸 사실(목표 금액·기한·상품 이름·금리·세율). 문구 속 숫자를 이 값과 대조한다(ProposalText). */
	static Checked check(List<Draft> drafts, ProposalText.Facts facts) {
		if (drafts == null || drafts.size() < 2 || drafts.size() > 3) {
			return Checked.fail("COUNT");
		}
		List<Plan> out = new ArrayList<>();
		Set<String> ids = new HashSet<>();
		for (int i = 0; i < drafts.size(); i++) {
			Draft d = drafts.get(i);
			String at = "#" + (i + 1);
			if (d == null || d.mix() == null) {
				return Checked.fail("MISSING " + at);
			}
			if (d.id() == null || d.id().isBlank() || !ids.add(d.id())) {
				return Checked.fail("ID " + at);
			}
			Map<ProductType, Integer> mix = new EnumMap<>(ProductType.class);
			int sum = 0;
			for (var e : d.mix().entrySet()) {
				ProductType t = type(e.getKey());
				Integer ratio = e.getValue();
				if (t == null || mix.containsKey(t)) {
					return Checked.fail("MIX_TYPE " + at);
				}
				if (ratio == null || ratio < 0 || ratio > 100) {
					return Checked.fail("MIX_RANGE " + at);
				}
				sum += ratio;
				mix.put(t, ratio);
			}
			mix.values().removeIf(r -> r == 0);
			if (sum != 100 || mix.isEmpty()) {
				return Checked.fail("MIX_SUM " + at);
			}
			String[][] fields = { { "title", d.title(), "20" }, { "summary", d.summary(), "40" }, { "explanation", d.explanation(), "300" } };
			for (String[] f : fields) {
				String problem = text(f[1], Integer.parseInt(f[2]), facts, mix.values());
				if (problem != null) {
					return Checked.fail(problem + " " + at + "." + f[0], f[1]);
				}
			}
			out.add(new Plan(d.id(), d.title().strip(), d.summary().strip(), d.explanation().strip(), mix));
		}
		return new Checked(out, null, null);
	}

	/** 문구 규칙을 어기면 이유 코드, 지키면 null. */
	private static String text(String s, int max, ProposalText.Facts facts, java.util.Collection<Integer> mix) {
		if (s == null || s.strip().isEmpty()) {
			return "TEXT_EMPTY";
		}
		String t = s.strip();
		if (t.length() > max) {
			return "TEXT_LENGTH";
		}
		return ProposalText.problem(t, facts, mix);
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
