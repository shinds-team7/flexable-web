package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.LinkedHashMap;
import java.util.List;
import java.util.Map;

/**
 * 배치고사 문제의 "공시 주요 내용"(decisions/2026-11-05-virtual-sim-contest 2-2, policies §8-8 "공시 주요 내용"). 상태를 갖지 않는다.
 * OpenDART 주요사항보고서 주요정보(DS005) 한 행에서 화면용 항목(이름·값, 최대 4개)을 만든다. 금액은 서버가 원 단위 정수로 계산하고 나눗셈은 내림이다.
 * 회사를 찾아낼 수 없게 절대 금액 대신 비율(소수 1자리 내림)·규모 구간만 내고, 회사·상대방 이름·날짜 칸은 읽지 않는다.
 * 글 칸(증자 방식·목적 등)은 정해 둔 낱말이 있을 때만 정해 둔 이름으로 바꿔 내고 원문은 내지 않는다. 방향·경향을 말하는 항목은 없다.
 */
public final class PlacementDetails {

	private PlacementDetails() {
	}

	/** 항목 규칙 버전. 규칙을 바꾸면 올리고, 수집 작업이 이전 버전 행을 다시 받는다 */
	public static final String VERSION = "vsim-details-v2";
	public static final int MAX_ITEMS = 4;

	/** 화면에 보이는 항목 하나 */
	public record Detail(String label, String value) {
	}

	private static final long EOK = 100_000_000L;
	/** 규모 구간 경계(원, 아래 경계 포함)와 이름 */
	private static final long[] BUCKET_FROM = { 10 * EOK, 50 * EOK, 100 * EOK, 500 * EOK, 1_000 * EOK, 5_000 * EOK, 10_000 * EOK };
	private static final String[] BUCKET_NAME = { "10억 원 미만", "10억~50억 원", "50억~100억 원", "100억~500억 원", "500억~1천억 원", "1천억~5천억 원", "5천억~1조 원",
			"1조 원 이상" };

	/**
	 * 공시 제목 → DS005 API 이름(그 유형에 구조화 자료가 있을 때). 공백·가운뎃점을 지우고 본다. 제목 분류(VirtualSimCategory)와 같은 유형일 때만 쓴다.
	 * 거래소 수시공시(타법인주식·유형자산 "취득결정", 소송 제기·신청, 종속회사·자회사의 주요경영사항 등)와 소송 등의 제기(글 칸만 있음)는 null(유형 설명만 보인다)
	 */
	public static String api(String title) {
		VirtualSimCategory category = VirtualSimCategory.classify(title);
		if (category == null) {
			return null;
		}
		String t = title.replaceAll("[\\s\\u00a0·ㆍ・/]", "");
		// 종속회사·자회사의 주요경영사항은 그 회사가 낸 거래소 공시라 모회사 고유번호의 DS005에 없다
		if (subsidiary(t)) {
			return null;
		}
		return switch (category) {
			case NEW_SHARES -> t.contains("유상증자결정") ? "piicDecsn" : null;
			case BONUS_SHARES -> t.contains("무상증자결정") && !t.contains("유무상") ? "fricDecsn" : null;
			case BONDS -> t.contains("전환사채권발행결정") ? "cvbdIsDecsn"
					: t.contains("신주인수권부사채권발행결정") ? "bdwtIsDecsn" : t.contains("교환사채권발행결정") ? "exbdIsDecsn" : null;
			case BUYBACK_ACQUIRE -> t.contains("자기주식취득신탁계약체결결정") ? "tsstkAqTrctrCnsDecsn" : t.contains("자기주식취득결정") ? "tsstkAqDecsn" : null;
			case BUYBACK_DISPOSE -> t.contains("자기주식처분결정") ? "tsstkDpDecsn" : null;
			case RESTRUCTURE -> t.contains("회사합병결정") ? "cmpMgDecsn" : t.contains("회사분할결정") && !t.contains("분할합병") ? "cmpDvDecsn" : null;
			case FACILITY -> t.contains("유형자산양수결정") ? "tgastInhDecsn" : t.contains("타법인주식및출자증권양수결정") ? "otcprStkInvscrInhDecsn" : null;
			default -> null;
		};
	}

	/** 종속회사·자회사의 주요경영사항 공시인지(공백을 지운 제목) */
	static boolean subsidiary(String squeezedTitle) {
		return squeezedTitle.contains("종속회사") || squeezedTitle.contains("자회사의주요경영사항");
	}

	/** 정정 공시를 같은 공시로 묶는 열쇠: 앞의 [기재정정] 같은 표시와 공백·가운뎃점을 지운 제목 */
	public static String sameFilingKey(String title) {
		return title == null ? null : title.replaceAll("^(\\[[^\\]]*\\]\\s*)+", "").replaceAll("[\\s\\u00a0·ㆍ・/]", "");
	}

	/** DS005 한 행(칸 이름 → 값 글자) → 화면용 항목. 값이 빠진 항목은 내지 않는다 */
	public static List<Detail> items(String api, Map<String, String> row) {
		List<Detail> out = new ArrayList<>();
		switch (api) {
			case "piicDecsn" -> {
				add(out, "새 주식 수(기존 대비)", percent(ratio(sum(row, "nstk_ostk_cnt", "nstk_estk_cnt"), sum(row, "bfic_tisstk_ostk", "bfic_tisstk_estk"))));
				add(out, "조달 규모", bucket(sum(row, FUND_KEYS)));
				add(out, "자금 용도", shares(row, FUNDS));
				add(out, "증자 방식", issueMethod(row.get("ic_mthn")));
			}
			case "fricDecsn" -> add(out, "새 주식 수(기존 대비)",
					percent(ratio(sum(row, "nstk_ostk_cnt", "nstk_estk_cnt"), sum(row, "bfic_tisstk_ostk", "bfic_tisstk_estk"))));
			case "cvbdIsDecsn", "bdwtIsDecsn", "exbdIsDecsn" -> {
				add(out, "사채 종류", switch (api) {
					case "cvbdIsDecsn" -> "전환사채";
					case "bdwtIsDecsn" -> "신주인수권부사채";
					default -> "교환사채";
				});
				add(out, "발행 규모", bucket(amount(row.get("bd_fta"))));
				add(out, switch (api) {
					case "cvbdIsDecsn" -> "전환되면 늘어날 주식";
					case "bdwtIsDecsn" -> "권리 행사로 늘어날 주식";
					default -> "교환 대상 주식";
				}, percent(reported(row.get(switch (api) {
					case "cvbdIsDecsn" -> "cvisstk_tisstk_vs";
					case "bdwtIsDecsn" -> "nstk_isstk_tisstk_vs";
					default -> "extg_tisstk_vs";
				}))));
				add(out, "이자율", interest(rate(row.get("bd_intr_ex")), rate(row.get("bd_intr_sf"))));
			}
			case "tsstkAqDecsn" -> {
				add(out, "취득 예정 규모", bucket(sum(row, "aqpln_prc_ostk", "aqpln_prc_estk")));
				add(out, "취득 방법", acquireMethod(row.get("aq_mth")));
				add(out, "취득 목적", purpose(row.get("aq_pp"), ACQUIRE_PURPOSES));
			}
			case "tsstkAqTrctrCnsDecsn" -> {
				add(out, "취득 방법", "신탁 계약");
				add(out, "계약 규모", bucket(amount(row.get("ctr_prc"))));
				add(out, "계약 목적", purpose(row.get("ctr_pp"), ACQUIRE_PURPOSES));
			}
			case "tsstkDpDecsn" -> {
				add(out, "처분 예정 규모", bucket(sum(row, "dppln_prc_ostk", "dppln_prc_estk")));
				add(out, "처분 방법", shares(row, DISPOSE_METHODS));
				add(out, "처분 목적", purpose(row.get("dp_pp"), DISPOSE_PURPOSES));
			}
			case "cmpMgDecsn" -> {
				add(out, "합병 형태", first(row.get("mg_stn"), MERGE_FORMS));
				add(out, "상대 회사와의 관계", relation(row.get("mgptncmp_rl_cmpn")));
				add(out, "상대 회사 자산 규모", bucket(amount(row.get("rbsnfdtl_tast"))));
			}
			case "cmpDvDecsn" -> {
				add(out, "분할 방법", first(row.get("dv_mth"), SPLIT_FORMS));
				Long moved = amount(row.get("ffdtl_tast")), kept = amount(row.get("atdvfdtl_tast"));
				add(out, "떼어 내는 자산 비중", percent(ratio(moved, moved == null || kept == null ? null : moved + kept)));
				add(out, "새 회사 자산 규모", bucket(moved));
			}
			case "tgastInhDecsn" -> {
				add(out, "자산 종류", all(row.get("ast_sen"), ASSET_KINDS));
				add(out, "양수 규모", bucket(amount(row.get("inhdtl_inhprc"))));
				add(out, "자산총액 대비", percent(ratio(amount(row.get("inhdtl_inhprc")), amount(row.get("inhdtl_tast")))));
			}
			case "otcprStkInvscrInhDecsn" -> {
				add(out, "양수 규모", bucket(amount(row.get("inhdtl_inhprc"))));
				add(out, "자기자본 대비", percent(ratio(amount(row.get("inhdtl_inhprc")), amount(row.get("inhdtl_ecpt")))));
				add(out, "양수 뒤 지분율", percent(reported(row.get("atinh_eqrt"))));
				add(out, "대상 회사와의 관계", relation(row.get("iscmp_rl_cmpn")));
			}
			default -> {
			}
		}
		return out.size() > MAX_ITEMS ? List.copyOf(out.subList(0, MAX_ITEMS)) : List.copyOf(out);
	}

	// ───────── 계산(policies §8-8 "공시 주요 내용") ─────────

	/** 비율(1/10 % 단위) = ⌊a × 1000 / b⌋. a·b가 없거나 a ≤ 0, b ≤ 0이면 null */
	public static Long ratio(Long a, Long b) {
		if (a == null || b == null || a <= 0 || b <= 0) {
			return null;
		}
		return BigDecimal.valueOf(a).multiply(BigDecimal.valueOf(1000)).divide(BigDecimal.valueOf(b), 0, RoundingMode.FLOOR).longValueExact();
	}

	/** 공시에 적힌 비율(%) 글자 → 1/10 % 단위(소수 1자리 내림). 없거나 0 이하면 null */
	public static Long reported(String s) {
		BigDecimal d = decimal(s);
		if (d == null || d.signum() <= 0) {
			return null;
		}
		return d.movePointRight(1).setScale(0, RoundingMode.FLOOR).longValueExact();
	}

	/** 1/10 % 단위 → "23.4%". null이면 null */
	public static String percent(Long tenths) {
		return tenths == null ? null : tenths / 10 + "." + tenths % 10 + "%";
	}

	/** 규모 구간 이름 전부(작은 구간부터). 배치고사 공시 AI 요약이 금액을 쓸 수 있는 유일한 꼴이다(PlacementSummaries) */
	public static List<String> bucketNames() {
		return List.of(BUCKET_NAME);
	}

	/** 금액(원) → 규모 구간 이름. 없거나 0 이하면 null */
	public static String bucket(Long won) {
		if (won == null || won <= 0) {
			return null;
		}
		int i = 0;
		while (i < BUCKET_FROM.length && won >= BUCKET_FROM[i]) {
			i++;
		}
		return BUCKET_NAME[i];
	}

	/** 나눠 쓴 몫의 비중: 0보다 큰 칸만, 금액 큰 순(같으면 정해 둔 순서) 3개까지 "이름 ⌊칸 × 100 / 합⌋%"를 " · "로 잇는다. 합이 0 이하면 null */
	public static String shares(Map<String, String> row, Map<String, String> parts) {
		List<Map.Entry<String, Long>> nonZero = new ArrayList<>();
		long total = 0;
		for (var p : parts.entrySet()) {
			Long v = amount(row.get(p.getKey()));
			if (v != null && v > 0) {
				nonZero.add(Map.entry(p.getValue(), v));
				total += v;
			}
		}
		if (total <= 0) {
			return null;
		}
		long all = total;
		nonZero.sort(Comparator.comparing((Map.Entry<String, Long> e) -> e.getValue()).reversed());
		return String.join(" · ", nonZero.stream().limit(3).map(e -> e.getKey() + " " + Math.floorDiv(e.getValue() * 100, all) + "%").toList());
	}

	/** DART 숫자 글자("1,234,567") → 원 단위 정수. "-"·빈 값·숫자가 아니면 null */
	public static Long amount(String s) {
		BigDecimal d = decimal(s);
		if (d == null) {
			return null;
		}
		try {
			return d.setScale(0, RoundingMode.FLOOR).longValueExact();
		}
		catch (ArithmeticException e) {
			return null;
		}
	}

	private static BigDecimal decimal(String s) {
		if (s == null) {
			return null;
		}
		String t = s.replace(",", "").trim();
		if (t.isEmpty() || !t.matches("-?\\d+(\\.\\d+)?")) {
			return null;
		}
		return new BigDecimal(t);
	}

	/** 칸들의 합. 모두 비었으면 null */
	private static Long sum(Map<String, String> row, String... keys) {
		Long total = null;
		for (String k : keys) {
			Long v = amount(row.get(k));
			if (v != null) {
				total = (total == null ? 0 : total) + v;
			}
		}
		return total;
	}

	private static void add(List<Detail> out, String label, String value) {
		if (value != null) {
			out.add(new Detail(label, value));
		}
	}

	/** 이자율 글자 → 1/10 % 단위(소수 1자리 내림). 0%도 값이다. 없거나 음수면 null */
	private static Long rate(String s) {
		BigDecimal d = decimal(s);
		return d == null || d.signum() < 0 ? null : d.movePointRight(1).setScale(0, RoundingMode.FLOOR).longValueExact();
	}

	/** "표면 0.0% · 만기 2.5%". 둘 다 있어야 낸다 */
	private static String interest(Long coupon, Long maturity) {
		return coupon == null || maturity == null ? null : "표면 " + percent(coupon) + " · 만기 " + percent(maturity);
	}

	// ───────── 글 칸: 정해 둔 낱말 → 정해 둔 이름(원문은 내지 않는다) ─────────

	static final Map<String, String> FUNDS = ordered("fdpp_fclt", "시설", "fdpp_bsninh", "영업양수", "fdpp_op", "운영", "fdpp_dtrp", "채무상환",
			"fdpp_ocsa", "타법인 증권 취득", "fdpp_etc", "기타");
	private static final String[] FUND_KEYS = FUNDS.keySet().toArray(String[]::new);
	private static final Map<String, String> DISPOSE_METHODS = ordered("dp_m_mkt", "시장 매도", "dp_m_ovtm", "시간외대량매매", "dp_m_otc", "장외 처분", "dp_m_etc",
			"기타");
	/** 목적: 낱말 → 이름. 맞는 이름을 모두 잇는다 */
	private static final Map<String, String> ACQUIRE_PURPOSES = ordered("소각", "소각", "주가안정", "주가 안정·주주가치 제고", "주주가치", "주가 안정·주주가치 제고",
			"임직원", "임직원 보상", "성과", "임직원 보상", "우리사주", "임직원 보상");
	private static final Map<String, String> DISPOSE_PURPOSES = ordered("임직원", "임직원 보상", "성과", "임직원 보상", "우리사주", "임직원 보상", "상여",
			"임직원 보상", "교환사채", "교환사채 발행", "운영자금", "자금 마련", "재원", "자금 마련", "제휴", "사업 제휴·인수", "인수", "사업 제휴·인수");
	private static final Map<String, String> MERGE_FORMS = ordered("소규모", "소규모합병", "간이", "간이합병", "신설", "신설합병", "흡수", "흡수합병");
	private static final Map<String, String> SPLIT_FORMS = ordered("물적", "물적분할", "인적", "인적분할");
	private static final Map<String, String> ASSET_KINDS = ordered("토지", "토지", "건물", "건물", "기계", "기계·설비", "설비", "기계·설비", "선박", "선박");

	/** 증자 방식: 주주배정 뒤 일반공모 · 제3자배정 · 주주배정 · 일반공모 */
	static String issueMethod(String s) {
		String t = squeeze(s);
		if (t == null) {
			return null;
		}
		boolean holders = t.contains("주주배정"), pub = t.contains("일반공모");
		return holders && pub ? "주주배정 후 일반공모" : t.contains("제3자") ? "제3자배정" : holders ? "주주배정" : pub ? "일반공모" : null;
	}

	/** 자기주식 취득 방법 */
	static String acquireMethod(String s) {
		String t = squeeze(s);
		if (t == null) {
			return null;
		}
		return t.contains("공개매수") ? "공개매수" : t.contains("장내") ? "장내 매수" : t.contains("장외") ? "장외 취득" : t.contains("신탁") ? "신탁 계약" : null;
	}

	/** 관계: 자회사 · 계열회사 · 최대주주 · 관계 없음 */
	static String relation(String s) {
		String t = squeeze(s);
		if (t == null) {
			return null;
		}
		return t.contains("자회사") || t.contains("종속") ? "자회사" : t.contains("계열") ? "계열회사" : t.contains("최대주주") ? "최대주주"
				: t.contains("없") || t.contains("해당사항") || t.equals("-") ? "관계 없음" : null;
	}

	private static String first(String s, Map<String, String> words) {
		String t = squeeze(s);
		if (t == null) {
			return null;
		}
		return words.entrySet().stream().filter(e -> t.contains(e.getKey())).map(Map.Entry::getValue).findFirst().orElse(null);
	}

	private static String all(String s, Map<String, String> words) {
		String t = squeeze(s);
		if (t == null) {
			return null;
		}
		List<String> names = words.entrySet().stream().filter(e -> t.contains(e.getKey())).map(Map.Entry::getValue).distinct().toList();
		return names.isEmpty() ? null : String.join("·", names);
	}

	private static String purpose(String s, Map<String, String> words) {
		return all(s, words);
	}

	private static String squeeze(String s) {
		return s == null || s.isBlank() ? null : s.replaceAll("\\s", "");
	}

	private static Map<String, String> ordered(String... kv) {
		Map<String, String> m = new LinkedHashMap<>();
		for (int i = 0; i < kv.length; i += 2) {
			m.put(kv[i], kv[i + 1]);
		}
		return m;
	}
}
