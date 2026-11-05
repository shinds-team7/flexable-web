package com.flexable.web.virtualsim;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Collections;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.random.RandomGenerator;

/**
 * 배치고사 문제 풀(decisions/2026-11-05-virtual-sim-contest 2, 11-05 구현 PR 사용자 결정). 실제 과거 공시 하나와 그 뒤 5거래일 실제 방향이 문제·정답이다.
 * 정답 = 공시 기준 봉(접수일 당일, 휴일이면 직전 거래일) 종가 → 5번째 후속 거래일 종가가 올랐는지. 같으면(보합) 문제로 쓰지 않는다.
 * 출제: 지금 룰셋에서 경향이 뚜렷한 유형(UP·DOWN)의 공시 6개 + 유형 상관없이 4개, 서로 다른 공시 10개. 상태를 갖지 않는다.
 */
public final class VirtualContestQuestions {

	private VirtualContestQuestions() {
	}

	public static final int CLEAR = 6;
	public static final int ANY = 4;

	/**
	 * 문제 하나의 재료. company·date는 풀 때 숨기고 결과에서 공개한다(예시 자료는 date가 null). body는 실제 공시면 null(제목만), 예시면 예시 글.
	 * baseClose·afterClose: 기준 봉 종가와 5번째 후속 거래일 종가
	 */
	public record Past(String key, String company, String industry, VirtualSimCategory category, String title, String body, LocalDate date, long baseClose,
			long afterClose) {

		public boolean up() {
			return afterClose > baseClose;
		}
	}

	/** 공시 한 건 */
	public record Filing(String receiptNo, String title, LocalDate date) {
	}

	/** 한 종목의 실제 공시와 일봉으로 문제 재료를 만든다. 분류되지 않거나 기준 봉·후속 5거래일이 없거나 보합이면 뺀다 */
	public static List<Past> fromFilings(String company, String industry, List<Filing> filings, List<LocalDate> dates, List<Long> closes) {
		List<Past> out = new ArrayList<>();
		for (Filing f : filings) {
			VirtualSimCategory category = VirtualSimCategory.classify(f.title());
			if (category == null) {
				continue;
			}
			int base = VirtualSimRules.baseIndex(dates, f.date());
			if (base < 0 || base + VirtualSimRules.FOLLOW_DAYS >= dates.size()) {
				continue;
			}
			long b = closes.get(base), a = closes.get(base + VirtualSimRules.FOLLOW_DAYS);
			if (a != b) {
				out.add(new Past(f.receiptNo(), company, industry, category, f.title(), null, f.date(), b, a));
			}
		}
		return out;
	}

	/**
	 * 10문제를 뽑는다: clear(지금 룰셋에서 경향이 뚜렷한 유형)의 공시에서 6개, 남은 공시 전체에서 4개. 순서는 섞는다. 모자라면 빈 목록(503)
	 */
	public static List<Past> draw(List<Past> pool, Set<VirtualSimCategory> clear, RandomGenerator random) {
		List<Past> clearPool = new ArrayList<>(pool.stream().filter(p -> clear.contains(p.category())).toList());
		if (clearPool.size() < CLEAR || pool.size() < CLEAR + ANY) {
			return List.of();
		}
		List<Past> chosen = new ArrayList<>();
		Set<String> used = new HashSet<>();
		Collections.shuffle(clearPool, random);
		for (Past p : clearPool) {
			if (chosen.size() == CLEAR) {
				break;
			}
			if (used.add(p.key())) {
				chosen.add(p);
			}
		}
		List<Past> rest = new ArrayList<>(pool);
		Collections.shuffle(rest, random);
		for (Past p : rest) {
			if (chosen.size() == CLEAR + ANY) {
				break;
			}
			if (used.add(p.key())) {
				chosen.add(p);
			}
		}
		if (chosen.size() < CLEAR + ANY) {
			return List.of();
		}
		Collections.shuffle(chosen, random);
		return chosen;
	}

	/**
	 * 예시 자료(VIRTUAL_SIM_SOURCE=fake)의 문제 재료: 예시 회사의 사건마다 예시 룰셋에서 경로 몇 개를 골라 5거래일 누적 방향을 정답으로 쓴다(실제 공시가 아니다).
	 * bodies: 회사 → 유형별 사건 글
	 */
	public static List<Past> sample(Map<String, Map<VirtualSimCategory, String>> bodies, Map<String, String> industries, VirtualSimRuleset rules,
			RandomGenerator random) {
		List<Past> out = new ArrayList<>();
		bodies.forEach((company, byCategory) -> byCategory.forEach((category, body) -> rules.stats(category).ifPresent(st -> {
			for (int k = 0; k < 4; k++) {
				int[] path = st.samples().get(random.nextInt(st.samples().size()));
				long close = 10_000;
				for (int r : path) {
					close = Math.floorDiv(close * (10_000 + r), 10_000L);
				}
				if (close != 10_000) {
					out.add(new Past(company + ":" + category + ":" + k, company, industries.get(company), category,
							category.titles().get(random.nextInt(category.titles().size())), body, null, 10_000, close));
				}
			}
		})));
		return out;
	}
}
