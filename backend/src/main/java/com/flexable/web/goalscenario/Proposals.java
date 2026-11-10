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

	/**
	 * 제안기가 낸 시나리오 한 개. mix의 키는 유형 이름, 값은 비중(%). parts는 해설 네 칸이고 explanation은 그 칸을 합친 문단이다.
	 * 11-10(#391) 전에 저장한 재사용 조합은 parts가 없어(null) explanation만 검사해 쓴다.
	 */
	record Draft(String id, String title, String summary, String explanation, Map<String, Integer> mix, Parts parts) {
		Draft(String id, String title, String summary, Parts parts, Map<String, Integer> mix) {
			this(id, title, summary, parts == null ? null : parts.joined(), mix, parts);
		}

		/** 네 칸 없이 합친 문단만 있는 초안(옛 재사용 조합과 같은 모양). */
		Draft(String id, String title, String summary, String explanation, Map<String, Integer> mix) {
			this(id, title, summary, explanation, mix, null);
		}
	}

	/** 해설 네 칸(policies §7-6). 걸린 문장을 지워 빈 칸은 ""이다. */
	record Parts(String reason, String roles, String comparison, String fit) {
		List<String> all() {
			return java.util.Arrays.asList(reason, roles, comparison, fit);
		}

		/** 빈 칸을 뺀 나머지를 문단으로 합친다. */
		String joined() {
			return String.join("\n\n", all().stream().filter(t -> t != null && !t.isBlank()).map(String::strip).toList());
		}
	}

	/** 검증을 통과한 시나리오. mix는 비중이 0보다 큰 유형만, ProductType 순서. parts는 옛 재사용 조합이면 null. */
	record Plan(String id, String title, String summary, String explanation, Parts parts, Map<ProductType, Integer> mix) {
	}

	/** AI 연결 전·검증 실패 시 쓰는 데모 조합. 문구에도 숫자·보장 표현을 넣지 않는다. */
	static final List<Draft> DEMO = List.of(
			new Draft("steady", "차근차근 모으기", "이자가 정해진 상품만", new Parts(
					"원금이 줄어들 일 없이 목표에 닿도록 이자가 정해진 상품만 담은 조합이에요.",
					"적금으로 매달 꾸준히 모으고, 급하게 꺼낼 일에 대비해 일부는 CMA에 둬요.",
					"매달 넣는 돈은 세 조합 중 가장 많지만, 결과가 하나로 정해져요.",
					"기한 안에 꼭 써야 하는 돈이거나 금액이 흔들리는 게 불안할 때 맞아요."),
					ordered("SAVINGS", 70, "CMA", 30)),
			new Draft("spread", "나눠서 키우기", "저축 절반과 지수 ETF·주식", new Parts(
					"저축 몫으로 바닥을 받치고, 나머지는 국내·미국 지수 ETF와 주식에 나눠 넣은 조합이에요.",
					"적금·CMA는 정해진 이자로 모으고, 지수 ETF와 주식은 시장을 따라 오르내리며 키우는 몫이에요. 한 시장이 부진해도 다른 쪽이 메워 줄 수 있게 나눴어요.",
					"차근차근 모으기보다 매달 넣는 돈이 적을 수 있지만, 결과가 범위로 흔들려요.",
					"기한이 다가오면 투자 몫을 적금·CMA로 옮기는 것도 방법이에요. 어느 정도 오르내림을 견딜 수 있을 때 맞아요."),
					ordered("SAVINGS", 40, "CMA", 10, "KR_INDEX_ETF", 20, "US_INDEX_ETF", 20, "KOSPI_TOP5", 10)),
			new Draft("bold", "적극적으로 키우기", "지수 ETF·주식 중심", new Parts(
					"지수 ETF와 주식 비중을 크게 높여, 같은 목표를 더 적은 월 금액으로 노리는 조합이에요.",
					"적금·CMA는 작은 몫으로 급할 때 쓸 돈을 남기고, 지수 ETF와 주식이 대부분을 맡아요.",
					"세 조합 중 매달 넣는 돈이 가장 적을 수 있지만, 결과의 폭도 가장 넓어요.",
					"잘 안 풀리면 목표에 많이 못 미칠 수 있어서, 중간에 크게 줄어도 기다릴 수 있는 돈일 때만 고려해 보세요."),
					ordered("SAVINGS", 10, "CMA", 10, "KR_INDEX_ETF", 20, "US_INDEX_ETF", 30, "KOSPI_TOP5", 30)));

	/** 제안 하나의 시나리오 수. */
	static final int SCENARIOS = 3;

	/** 로그에 남기는 걸린 칸 문구의 최대 길이. 해설은 길이 제한이 없어 뒤쪽에서 걸린 문장도 보이게 넉넉히 둔다. */
	static final int LOG_TEXT_MAX = 2000;

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
	 * 검사 결과. 통과하면 plans와 해설에서 지운 문장(removed), 걸리면 problem(어긴 규칙·몇 번째 시나리오·칸, 예: "TEXT_NUMBER #2.explanation").
	 * problem에는 AI가 쓴 문구를 넣지 않는다(로그용).
	 */
	record Checked(List<Plan> plans, String problem, String rejectedText, List<Note> removed) {
		static Checked fail(String problem) {
			return new Checked(null, problem, null, List.of());
		}

		static Checked fail(String problem, String rejectedText) {
			return new Checked(null, problem, rejectedText, List.of());
		}

		/** 로그 한 줄. includeText면 걸린 칸의 문구도 붙인다(제어 문자는 공백으로, 최대 LOG_TEXT_MAX자). */
		String logLine(boolean includeText) {
			return line(problem, rejectedText, includeText);
		}
	}

	/** 통과한 제안의 해설에서 지운 문장. problem은 규칙과 위치(예: "TEXT_NUMBER #2.explanation"). */
	record Note(String problem, String sentence) {
		String logLine(boolean includeText) {
			return line(problem, sentence, includeText);
		}
	}

	private static String line(String problem, String text, boolean includeText) {
		if (!includeText || text == null || text.isBlank()) {
			return problem;
		}
		String clean = text.replaceAll("\\p{Cntrl}", " ").strip();
		return problem + " \"" + (clean.length() > LOG_TEXT_MAX ? clean.substring(0, LOG_TEXT_MAX) : clean) + "\"";
	}

	/** facts는 AI에게 보낸 사실(목표 금액·기한·상품 이름·금리·세율). 문구 속 숫자를 이 값과 대조한다(ProposalText). */
	static Checked check(List<Draft> drafts, ProposalText.Facts facts) {
		if (drafts == null || drafts.size() != SCENARIOS) {
			return Checked.fail("COUNT");
		}
		List<Plan> out = new ArrayList<>();
		List<Note> removed = new ArrayList<>();
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
			String[][] fields = { { "title", d.title(), "20" }, { "summary", d.summary(), "40" } };
			for (String[] f : fields) {
				String problem = text(f[1], Integer.parseInt(f[2]), facts, mix.values());
				if (problem != null) {
					return Checked.fail(problem + " " + at + "." + f[0], f[1]);
				}
			}
			// 로그 위치는 칸을 나누지 않고 "#2.explanation"으로 쓴다(§7-6).
			String field = at + ".explanation";
			List<String> texts = d.parts() == null ? java.util.Collections.singletonList(d.explanation()) : d.parts().all();
			String whole = d.parts() == null ? d.explanation() : d.parts().joined();
			if (texts.stream().anyMatch(t -> t == null || t.isBlank())) {
				return Checked.fail("TEXT_EMPTY " + field, whole);
			}
			// 해설은 칸마다 걸린 문장만 지운다. 네 칸이 다 지워지면 근거 없는 조합이 되므로 제안 전체를 버린다.
			List<String> kept = new ArrayList<>();
			List<ProposalText.Removed> gone = new ArrayList<>();
			for (String t : texts) {
				ProposalText.Cleaned cleaned = ProposalText.clean(t, facts, mix.values());
				kept.add(cleaned.text());
				gone.addAll(cleaned.removed());
			}
			if (kept.stream().allMatch(String::isEmpty)) {
				return Checked.fail(gone.getFirst().problem() + " " + field, whole);
			}
			gone.forEach(r -> removed.add(new Note(r.problem() + " " + field, r.sentence())));
			Parts parts = d.parts() == null ? null : new Parts(kept.get(0), kept.get(1), kept.get(2), kept.get(3));
			String explanation = parts == null ? kept.getFirst() : parts.joined();
			out.add(new Plan(d.id(), d.title().strip(), d.summary().strip(), explanation, parts, mix));
		}
		return new Checked(out, null, null, removed);
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
