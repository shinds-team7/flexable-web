package com.flexable.web.virtualsim;

import java.util.ArrayList;
import java.util.EnumMap;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;
import java.util.SplittableRandom;

import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;
import com.flexable.web.virtualsim.VirtualSimRuleset.Grade;

/**
 * 예시 자료(VIRTUAL_SIM_SOURCE=fake, decisions/2026-11-04-virtual-simulation 4-8). 키 없이 로컬·테스트에서 끝까지 해 보려고
 * 코드에 넣은 예시 룰셋(유형 5개, 그중 뚜렷한 유형 3개)과 예시 회사 6곳의 글이다. 실제 시장 통계·AI 글이 아니다(isSample=true).
 */
public final class VirtualSimSample {

	private VirtualSimSample() {
	}

	public static final String MODEL = "sample";
	public static final String PROMPT_VERSION = "vsim-sample-v2";

	/** 회사 한 곳의 글. bodies: 유형 → 사건 본문 */
	public record Draft(String name, String industry, String intro, Map<VirtualSimCategory, String> bodies) {
	}

	/** 유형마다 하루 평균 등락(bp). 0이면 경로를 둘씩 부호를 뒤집어 상승 비율 0.5로 둔다 */
	private static final Map<VirtualSimCategory, Integer> DRIFT = new LinkedHashMap<>();
	static {
		DRIFT.put(VirtualSimCategory.SUPPLY_CONTRACT, 60);
		DRIFT.put(VirtualSimCategory.BUYBACK_ACQUIRE, 50);
		DRIFT.put(VirtualSimCategory.NEW_SHARES, -70);
		DRIFT.put(VirtualSimCategory.EARNINGS, 0);
		DRIFT.put(VirtualSimCategory.DIVIDEND, 0);
	}

	private static final VirtualSimRuleset RULESET = build();

	public static VirtualSimRuleset ruleset() {
		return RULESET;
	}

	private static VirtualSimRuleset build() {
		SplittableRandom rnd = new SplittableRandom(20_361_104L);
		List<CategoryStats> stats = new ArrayList<>();
		DRIFT.forEach((category, drift) -> {
			int n = 300;
			List<int[]> paths = new ArrayList<>();
			for (int j = 0; j < n; j++) {
				int[] p = new int[VirtualSimRules.FOLLOW_DAYS];
				for (int k = 0; k < p.length; k++) {
					p[k] = (int) Math.round(gauss(rnd) * 180) + drift;
				}
				if (drift == 0 && j % 2 == 1) {
					int[] before = paths.get(j - 1);
					for (int k = 0; k < p.length; k++) {
						p[k] = -before[k];
					}
				}
				paths.add(p);
			}
			int up = 0, down = 0;
			int[] cumulative = new int[n];
			for (int j = 0; j < n; j++) {
				long close = 10_000;
				for (int r : paths.get(j)) {
					close = Math.floorDiv(close * (10_000 + r), 10_000L);
				}
				cumulative[j] = VirtualSimRules.returnBp(10_000, close);
				up += close > 10_000 ? 1 : 0;
				down += close < 10_000 ? 1 : 0;
			}
			int[] q = VirtualSimRules.quantiles(cumulative);
			var share = VirtualSimRules.upShare(n, up);
			stats.add(new CategoryStats(category, n, up, down, n - up - down, share, q[500], q[250], q[750], null,
					VirtualSimRules.trend(n, share), List.copyOf(paths)));
		});
		List<Grade> grades = new ArrayList<>();
		int[][] spread = { { 90, 30, 40 }, { 160, 50, 70 }, { 260, 80, 110 } };
		for (int[] s : spread) {
			grades.add(new Grade(sample(rnd, 2_000, s[0], false), sample(rnd, 1_000, s[1], false), sample(rnd, 1_000, s[2], true),
					sample(rnd, 1_000, s[2], true)));
		}
		return new VirtualSimRuleset(VirtualSimRuleset.VERSION, null, null, true, List.of("학습용 예시 통계", "예시 작성기"), List.copyOf(stats),
				List.copyOf(grades));
	}

	private static int[] sample(SplittableRandom rnd, int n, int sd, boolean positive) {
		int[] v = new int[n];
		for (int i = 0; i < n; i++) {
			int x = (int) Math.round(gauss(rnd) * sd);
			v[i] = positive ? Math.abs(x) : x;
		}
		return VirtualSimRules.quantiles(v);
	}

	/** 표준 정규 난수(Box–Muller). SplittableRandom에는 nextGaussian이 없다 */
	private static double gauss(SplittableRandom rnd) {
		double u = 1 - rnd.nextDouble(), v = rnd.nextDouble();
		return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
	}

	/** 예시 회사 6곳. 사건 본문은 예시 룰셋의 유형 5개를 모두 쓴다 */
	public static List<Draft> companies() {
		String[][] rows = {
				{ "해솔소재", "2차전지 소재", "배터리에 들어가는 양극재를 만드는 학습용 예시 회사예요." },
				{ "다온바이오", "바이오 의약품", "항체 치료제를 연구하는 학습용 예시 회사예요." },
				{ "누리모빌리티", "로봇", "물류 창고용 이동 로봇을 만드는 학습용 예시 회사예요." },
				{ "별빛게임즈", "게임", "모바일 퍼즐 게임을 만드는 학습용 예시 회사예요." },
				{ "가람물류", "물류", "전국 택배 거점을 운영하는 학습용 예시 회사예요." },
				{ "이음클라우드", "클라우드 소프트웨어", "기업용 협업 소프트웨어를 파는 학습용 예시 회사예요." } };
		List<Draft> out = new ArrayList<>();
		for (String[] r : rows) {
			String name = r[0], ga = name + particle(name, "이", "가");
			Map<VirtualSimCategory, String> bodies = new EnumMap<>(VirtualSimCategory.class);
			bodies.put(VirtualSimCategory.SUPPLY_CONTRACT, ga + " 국내 업체와 제품 공급 계약을 맺었다고 밝혔어요. 계약에 따라 회사는 거래처 공장에 제품을 정해진 일정대로 나누어 납품해요. 납품 조건과 일정은 계약서에 함께 담겼어요.");
			bodies.put(VirtualSimCategory.BUYBACK_ACQUIRE, ga + " 이사회에서 자기주식 취득을 결정했어요. 회사는 정해진 기간 동안 장내에서 자기 회사 주식을 사들일 예정이에요. 취득한 주식은 회사가 보관한다고 밝혔어요.");
			bodies.put(VirtualSimCategory.NEW_SHARES, ga + " 이사회에서 유상증자를 결정했다고 밝혔어요. 새 주식은 기존 주주에게 먼저 배정하고 남은 주식은 일반 투자자에게 청약을 받아요. 모은 돈은 운영 자금으로 쓸 예정이에요.");
			bodies.put(VirtualSimCategory.EARNINGS, ga + " 지난 분기 잠정 실적을 공시했어요. 공시에는 매출과 영업이익 같은 분기 실적 항목이 담겼어요. 확정 실적은 감사를 거쳐 정기 보고서로 다시 알릴 예정이에요.");
			bodies.put(VirtualSimCategory.DIVIDEND, ga + " 이사회에서 결산 배당을 결정했어요. 배당은 정기 주주총회의 승인을 거쳐 주주에게 지급돼요. 회사는 배당 기준일과 지급 절차를 함께 안내했어요.");
			out.add(new Draft(name, r[1], name + particle(name, "은", "는") + " " + r[2], bodies));
		}
		return out;
	}

	/** 마지막 글자에 받침이 있으면 withFinal, 없으면 without */
	public static String particle(String word, String withFinal, String without) {
		char c = word.charAt(word.length() - 1);
		return c >= '가' && c <= '힣' && (c - '가') % 28 != 0 ? withFinal : without;
	}
}
