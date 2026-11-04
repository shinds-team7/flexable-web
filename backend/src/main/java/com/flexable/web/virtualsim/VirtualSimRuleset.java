package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.util.List;
import java.util.Optional;

/**
 * 룰셋 한 묶음(vsim-rules-v2, decisions/2026-11-04-virtual-simulation 1-7). worker가 만들어 virtual_sim_rulesets.payload에 JSON으로 두고,
 * 세션은 시작할 때 최신 것을 복사해 그 실행 동안 바꾸지 않는다. 등락·갭·꼬리는 bp 정수다.
 * dataFrom·dataTo: 자료 기간(예시 룰셋은 null), sources: 화면 출처 표시.
 */
public record VirtualSimRuleset(String version, String dataFrom, String dataTo, boolean isSample, List<String> sources,
		List<CategoryStats> categories, List<Grade> grades) {

	public static final String VERSION = "vsim-rules-v2";

	/**
	 * 유형별 요약과 후속 경로. paths: 500개로 추리기 전 전체 경로 수 n, up·down·flat: 5거래일 누적이 오른·내린·같은 수,
	 * upShare: floor(up × 10000 / n) / 10000, medianBp·p25Bp·p75Bp: 누적 등락 분위, volumeRatio: 거래량 배수 중앙값(없으면 null, 기록만),
	 * trend: UP | DOWN | MIXED, samples: 가격 생성에 쓰는 경로(최대 500개, 하나에 1~5번째 후속 거래일 등락 5개).
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
