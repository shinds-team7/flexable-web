package com.flexable.web.goalscenario;

import java.util.Map;

/**
 * 시나리오 세 단계(policies §7-4). 투자 몫(국내·미국 지수 ETF·코스피 대형주 비중 합)이 단계 범위 안에 있어야 한다.
 * 범위가 겹치지 않아 안정 < 균형 < 적극 순서도 함께 지켜진다. id는 응답 시나리오 id이고 화면이 단계를 구분하는 값이다.
 */
enum ScenarioTier {
	STABLE("stable", 0, 30), BALANCED("balanced", 31, 60), ACTIVE("active", 61, 100);

	private final String id;
	private final int minInvest;
	private final int maxInvest;

	ScenarioTier(String id, int minInvest, int maxInvest) {
		this.id = id;
		this.minInvest = minInvest;
		this.maxInvest = maxInvest;
	}

	String id() {
		return id;
	}

	int minInvest() {
		return minInvest;
	}

	int maxInvest() {
		return maxInvest;
	}

	boolean accepts(Map<ProductType, Integer> mix) {
		int share = investShare(mix);
		return share >= minInvest && share <= maxInvest;
	}

	/** 투자 유형 비중의 합(%). */
	static int investShare(Map<ProductType, Integer> mix) {
		return mix.entrySet().stream().filter(e -> e.getKey().invest()).mapToInt(Map.Entry::getValue).sum();
	}
}
