package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.EnumSet;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.random.RandomGenerator;

/**
 * 배치고사 문제 풀(decisions/2026-11-05-virtual-sim-contest 2, decisions/2026-11-09-placement-reaction-window). 실제 과거 공시 하나와 공시 직후 실제 방향이 문제·정답이다.
 * 정답 = 반응 창: 기준 봉(접수일 당일, 휴일이면 직전 거래일) 전날 종가 → 다음 거래일 종가가 올랐는지. 같으면(보합) 문제로 쓰지 않는다.
 * 그다음 주(다음 거래일 종가 → 5번째 후속 거래일 종가)는 결과에 함께 보이고 채점에는 쓰지 않는다.
 * 출제: 반응 창 근거 유형(EVIDENCE_TYPES)의 공시 4개 + 유형 상관없이 6개, 서로 다른 공시 10개. 정정 공시는 문제로 내지 않고 원공시에 합친다(Issue #375). 상태를 갖지 않는다.
 */
public final class VirtualContestQuestions {

	private VirtualContestQuestions() {
	}

	public static final int EVIDENCE = 4;
	public static final int ANY = 6;
	/**
	 * 반응 창 근거 유형: 공시 반응 측정 v2(docs/reference/disclosure-reaction-v2-2026-11-09.md)에서 반응 창 "근거 있음"(BH q<0.10, 두 기간 재현)인 유형.
	 * 룰셋과 상관없이 결정 기록에 고정한다
	 */
	public static final Set<VirtualSimCategory> EVIDENCE_TYPES = Collections.unmodifiableSet(
			EnumSet.of(VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.BUYBACK_ACQUIRE, VirtualSimCategory.FACILITY));
	/** 채점 기준: 반응 창(이 규칙), 5거래일(이전 규칙. 이 규칙 전에 시작한 배치고사 사본·결과) */
	public static final String REACTION = "REACTION";
	public static final String FIVE_DAY = "FIVE_DAY";
	/** 정정 공시를 원공시에 합치는 기간(원공시 접수일부터). 공시 주요 내용 수집이 정정본 값을 찾는 기간(DisclosureDetailJob.CORRECTION_DAYS)과 같다 */
	public static final int CORRECTION_DAYS = 180;

	/**
	 * 문제 하나의 재료. company·date는 풀 때 숨기고 결과에서 공개한다(예시 자료는 date가 null). body는 실제 공시면 null(본문을 저장하지 않음), 예시면 예시 글.
	 * details: 공시 주요 내용(PlacementDetails, 비율·규모 구간). 구조화 자료가 없는 유형이거나 아직 받지 않았으면 null. 예시 자료는 예시 값.
	 * prevClose·nextClose·afterClose: 기준 봉 전날 종가, 다음 거래일 종가, 5번째 후속 거래일 종가.
	 * sources: 이 문제의 요약·주요 내용을 찾을 접수번호(원공시 key 먼저, 그다음 합친 정정 공시를 가까운 순으로)
	 */
	public record Past(String key, String company, String industry, VirtualSimCategory category, String title, String body, List<PlacementDetails.Detail> details,
			LocalDate date, long prevClose, long nextClose, long afterClose, List<String> sources) {

		/** 정정 공시를 합치지 않은 문제(예시 자료·시험) */
		public Past(String key, String company, String industry, VirtualSimCategory category, String title, String body, List<PlacementDetails.Detail> details,
				LocalDate date, long prevClose, long nextClose, long afterClose) {
			this(key, company, industry, category, title, body, details, date, prevClose, nextClose, afterClose, List.of(key));
		}

		/** 정답: 공시 직후(전날 종가 → 다음 거래일 종가) 올랐는지 */
		public boolean up() {
			return nextClose > prevClose;
		}

		/** 공시 직후 등락(전날 종가 → 다음 거래일 종가, 소수 4자리 내림) */
		public BigDecimal reactionRate() {
			return VirtualContestRules.rate(nextClose, prevClose);
		}

		/** 그다음 주 등락(다음 거래일 종가 → 5번째 후속 거래일 종가, 소수 4자리 내림) */
		public BigDecimal nextWeekRate() {
			return VirtualContestRules.rate(afterClose, nextClose);
		}
	}

	/** 공시 한 건. details: 그 공시의 주요 내용(없으면 null) */
	public record Filing(String receiptNo, String title, LocalDate date, List<PlacementDetails.Detail> details) {

		public Filing(String receiptNo, String title, LocalDate date) {
			this(receiptNo, title, date, null);
		}
	}

	/**
	 * 한 종목의 실제 공시와 일봉으로 문제 재료를 만든다. 분류되지 않거나 기준 봉 전날·후속 5거래일이 없거나 공시 직후가 보합이면 뺀다.
	 * 정정 공시는 문제로 내지 않는다(merge): 정정일의 공시 직후는 원래 공시의 반응이 아니다. 원공시의 주요 내용이 없으면 합친 정정 공시의 것을 가까운 순으로 쓴다
	 */
	public static List<Past> fromFilings(String company, String industry, List<Filing> filings, List<LocalDate> dates, List<Long> closes) {
		List<Past> out = new ArrayList<>();
		for (Merged m : merge(filings)) {
			Filing f = m.original();
			VirtualSimCategory category = VirtualSimCategory.classify(f.title());
			int base = VirtualSimRules.baseIndex(dates, f.date());
			if (base < 1 || base + VirtualSimRules.FOLLOW_DAYS >= dates.size()) {
				continue;
			}
			long prev = closes.get(base - 1), next = closes.get(base + 1), after = closes.get(base + VirtualSimRules.FOLLOW_DAYS);
			if (next == prev) {
				continue;
			}
			List<PlacementDetails.Detail> details = null;
			List<String> sources = new ArrayList<>();
			sources.add(f.receiptNo());
			if (f.details() != null && !f.details().isEmpty()) {
				details = f.details();
			}
			for (Filing c : m.corrections()) {
				sources.add(c.receiptNo());
				if (details == null && c.details() != null && !c.details().isEmpty()) {
					details = c.details();
				}
			}
			out.add(new Past(f.receiptNo(), company, industry, category, f.title(), null, details, f.date(), prev, next, after, List.copyOf(sources)));
		}
		return out;
	}

	/** 원공시 하나와 거기에 합친 정정 공시(가까운 순) */
	public record Merged(Filing original, List<Filing> corrections) {
	}

	/**
	 * 한 종목의 공시 중 유형으로 분류되는 것을 원공시마다 묶는다(Issue #375, 공시 반응 측정 v2 "정정 병합"과 같은 짝). 접수일·접수번호 순으로 보며,
	 * 정정 공시(correction)는 같은 공시 열쇠(PlacementDetails.sameFilingKey)의 가장 가까운 앞 원공시에 합친다. 그 원공시가 받은 공시 안에 없거나(수집 기간 밖)
	 * CORRECTION_DAYS보다 오래 전이면 버린다. 결과는 원공시 접수 순서다
	 */
	public static List<Merged> merge(List<Filing> filings) {
		List<Filing> sorted = filings.stream().filter(f -> VirtualSimCategory.classify(f.title()) != null)
			.sorted(java.util.Comparator.comparing(Filing::date).thenComparing(Filing::receiptNo)).toList();
		Map<String, Filing> latestOriginal = new java.util.HashMap<>();
		Map<String, List<Filing>> corrections = new java.util.LinkedHashMap<>();
		for (Filing f : sorted) {
			String key = PlacementDetails.sameFilingKey(f.title());
			if (!correction(f.title())) {
				latestOriginal.put(key, f);
				corrections.put(f.receiptNo(), new ArrayList<>());
				continue;
			}
			Filing o = latestOriginal.get(key);
			if (o != null && !f.date().isAfter(o.date().plusDays(CORRECTION_DAYS))) {
				corrections.get(o.receiptNo()).add(f);
			}
		}
		Map<String, Filing> byReceipt = new java.util.HashMap<>();
		sorted.forEach(f -> byReceipt.put(f.receiptNo(), f));
		List<Merged> out = new ArrayList<>();
		corrections.forEach((no, list) -> out.add(new Merged(byReceipt.get(no), List.copyOf(list))));
		return out;
	}

	/** 정정 공시인지: 제목 앞 대괄호 표시에 "정정"이 있다([기재정정]·[첨부정정]·[정정제출요구] 등). [첨부추가]·[연장결정]은 원공시로 본다(측정 v2와 같음) */
	public static boolean correction(String title) {
		return title != null && title.strip().matches("^(\\[[^\\]]*\\]\\s*)*\\[[^\\]]*정정[^\\]]*\\].*");
	}

	/**
	 * 설명이 있는 공시인지: 공시 AI 요약(summarized, 숨기지 않은 요약이 있는 접수번호. 원공시나 합친 정정 공시)·공시 주요 내용·예시 글 중 하나가 있다.
	 * 셋 다 없으면 문제 화면에 제목과 유형 설명만 남는다
	 */
	public static boolean described(Past p, Set<String> summarized) {
		return p.body() != null || p.details() != null || p.sources().stream().anyMatch(summarized::contains);
	}

	/**
	 * 10문제를 뽑는다: 반응 창 근거 유형(EVIDENCE_TYPES)의 공시에서 4개, 남은 공시 전체(근거 유형 포함)에서 6개. 각 묶음에서 설명이 있는 공시(described)를
	 * 먼저 무작위로 고르고, 모자라면 설명이 없는 공시로 채운다. 순서는 섞는다. 모자라면 빈 목록(503)
	 */
	public static List<Past> draw(List<Past> pool, Set<String> summarized, RandomGenerator random) {
		List<Past> evidencePool = new ArrayList<>(pool.stream().filter(p -> EVIDENCE_TYPES.contains(p.category())).toList());
		if (evidencePool.size() < EVIDENCE || pool.size() < EVIDENCE + ANY) {
			return List.of();
		}
		List<Past> chosen = new ArrayList<>();
		Set<String> used = new HashSet<>();
		describedFirst(evidencePool, summarized, random);
		for (Past p : evidencePool) {
			if (chosen.size() == EVIDENCE) {
				break;
			}
			if (used.add(p.key())) {
				chosen.add(p);
			}
		}
		List<Past> rest = new ArrayList<>(pool);
		describedFirst(rest, summarized, random);
		for (Past p : rest) {
			if (chosen.size() == EVIDENCE + ANY) {
				break;
			}
			if (used.add(p.key())) {
				chosen.add(p);
			}
		}
		if (chosen.size() < EVIDENCE + ANY) {
			return List.of();
		}
		Collections.shuffle(chosen, random);
		return chosen;
	}

	/** 섞은 뒤 설명이 있는 공시를 앞으로(같은 쪽 안에서는 섞인 순서 그대로) */
	private static void describedFirst(List<Past> list, Set<String> summarized, RandomGenerator random) {
		Collections.shuffle(list, random);
		list.sort(java.util.Comparator.comparing((Past p) -> !described(p, summarized)));
	}

	/**
	 * 예시 자료(VIRTUAL_SIM_SOURCE=fake)의 문제 재료: 예시 회사의 사건마다 예시 룰셋에서 경로 몇 개를 골라 쓴다(실제 공시가 아니다).
	 * 전날 종가를 10,000으로 두고 경로를 이어 붙인다. v3 경로(6개, 기준 봉 당일부터)는 둘째 날까지가 공시 직후(정답)이고 셋째~여섯째 날이 그다음 주다.
	 * v2 경로(5개, 기준 봉 당일 등락이 없음)는 전날 종가 = 기준 봉 종가로 보고 첫째 날까지가 공시 직후, 둘째~다섯째 날이 그다음 주다.
	 * bodies: 회사 → 유형별 사건 글. 주요 내용은 유형마다 고정한 예시 값(VirtualSimSample.details, 실제 공시처럼 구조화 자료가 없는 유형은 null)
	 */
	public static List<Past> sample(Map<String, Map<VirtualSimCategory, String>> bodies, Map<String, String> industries, VirtualSimRuleset rules,
			RandomGenerator random) {
		List<Past> out = new ArrayList<>();
		bodies.forEach((company, byCategory) -> byCategory.forEach((category, body) -> rules.stats(category).ifPresent(st -> {
			for (int k = 0; k < 4; k++) {
				int[] path = st.samples().get(random.nextInt(st.samples().size()));
				int reactionEnd = path.length > VirtualSimRules.FOLLOW_DAYS ? 1 : 0;
				long close = 10_000, next = 0;
				for (int d = 0; d < path.length; d++) {
					close = Math.floorDiv(close * (10_000 + path[d]), 10_000L);
					if (d == reactionEnd) {
						next = close;
					}
				}
				if (next != 10_000) {
					out.add(new Past(company + ":" + category + ":" + k, company, industries.get(company), category,
							category.titles().get(random.nextInt(category.titles().size())), body, VirtualSimSample.details(category), null, 10_000, next, close));
				}
			}
		})));
		return out;
	}
}
