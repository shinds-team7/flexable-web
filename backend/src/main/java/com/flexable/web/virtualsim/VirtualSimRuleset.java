package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * 룰셋 한 묶음(vsim-rules-v3, decisions/2026-11-04-virtual-simulation 1-7, decisions/2026-11-10-vsim-ruleset-reaction-window). worker가 만들어 virtual_sim_rulesets.payload에 JSON으로 두고,
 * 세션은 시작할 때 최신 것을 복사해 그 실행 동안 바꾸지 않는다. 등락·갭·꼬리는 bp 정수다.
 * dataFrom·dataTo: 자료 기간(예시 룰셋은 null), sources: 화면 출처 표시.
 */
public record VirtualSimRuleset(String version, String dataFrom, String dataTo, boolean isSample, List<String> sources,
		List<CategoryStats> categories, List<Grade> grades) {

	/** v2: 경로 = 1~5번째 후속 거래일 5개, 상승 비율 = 5거래일, 경향 = 0.55·0.45. v3: 경로 = 사건 봉 + 1~5번째 후속 거래일 6개, 상승 비율 = 공시 직후, 경향 = 고정 목록 */
	public static final String V2 = "vsim-rules-v2";
	public static final String VERSION = "vsim-rules-v3";

	/**
	 * 유형별 요약과 경로. paths: 500개로 추리기 전 전체 경로 수 n, up·down·flat: 공시 직후(기준 봉 전날 종가 → 다음 거래일 종가)가 오른·내린·같은 수
	 * (v2 룰셋은 5거래일 누적), upShare: floor(up × 10000 / n) / 10000, medianBp·p25Bp·p75Bp: 공시 직후 등락 분위, volumeRatio: 거래량 배수 중앙값(없으면 null, 기록만),
	 * trend: UP | DOWN | MIXED(v3는 고정 목록), samples: 가격 생성에 쓰는 경로(최대 500개, v3는 하나에 사건 봉 + 1~5번째 후속 거래일 등락 6개, v2는 후속 5개).
	 */
	public record CategoryStats(VirtualSimCategory category, int paths, int up, int down, int flat, BigDecimal upShare, int medianBp, int p25Bp,
			int p75Bp, BigDecimal volumeRatio, String trend, List<int[]> samples) {

		public boolean clear() {
			return !VirtualSimRules.MIXED.equals(trend);
		}
	}

	/** 변동성 등급(0 낮음·1 보통·2 높음) 하나의 분위표. 각각 1,001칸: 평소 하루 종가 등락 r, 시가 갭 g, 윗꼬리 u, 아랫꼬리 d */
	public record Grade(int[] r, int[] g, int[] u, int[] d) {
	}

	public Optional<CategoryStats> stats(VirtualSimCategory category) {
		return categories.stream().filter(c -> c.category() == category).findFirst();
	}
}
