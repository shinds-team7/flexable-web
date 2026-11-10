package com.flexable.web.goalscenario;

import java.text.NumberFormat;
import java.util.Locale;

import com.flexable.web.goalscenario.GoalScenarioDtos.Outcome;

/**
 * 결과 문장(policies §7-5 resultText). 서버가 정해 둔 문장에 서버 계산값만 넣는다. 표기는 화면(GoalScenarios.tsx manwon·pct)과 같고 모두 내림이다.
 * AI(제안기)는 이 문장을 만들지 않는다.
 */
final class ScenarioResultText {

	static final String UNREACHABLE = "목표 금액 안의 월 금액으로는 10번 중 8번 목표에 닿지 못했어요. 기한을 늘리거나 목표를 조정해 보세요.";

	private ScenarioResultText() {
	}

	/** months는 기한(개월). 닿지 못했거나 결과가 없으면 UNREACHABLE. */
	static String of(boolean reachable, Long monthly, Outcome outcome, int months) {
		if (!reachable || monthly == null || outcome == null) {
			return UNREACHABLE;
		}
		String pay = "매달 " + won(monthly) + "원씩 넣으면 ";
		if ("FIXED".equals(outcome.kind()) && outcome.fixedAmount() != null) {
			return pay + period(months) + " 뒤 " + manwon(outcome.fixedAmount()) + "이 돼요(세후 이자 포함).";
		}
		if (outcome.low() == null) {
			return UNREACHABLE;
		}
		return pay + "10번 중 " + Math.floorDiv(outcome.chanceBp(), 1000) + "번 목표에 닿아요. 잘 안 풀리면(하위 10%) " + manwon(outcome.low())
				+ "이고, 원금보다 적게 남을 가능성은 " + Math.floorDiv(outcome.lossBp(), 100) + "%예요.";
	}

	private static String won(long n) {
		return NumberFormat.getIntegerInstance(Locale.KOREA).format(n);
	}

	/** 만 원 미만 내림. "1억 2,345만 원", "1,125만 원", "1억 원", 만 원이 안 되면 "9,999원". */
	static String manwon(long n) {
		long man = Math.floorDiv(n, 10_000);
		long eok = Math.floorDiv(man, 10_000);
		long rest = man % 10_000;
		if (eok == 0 && rest == 0) {
			return won(n) + "원";
		}
		StringBuilder out = new StringBuilder();
		if (eok != 0) {
			out.append(eok).append("억");
		}
		if (rest != 0) {
			out.append(out.isEmpty() ? "" : " ").append(won(rest)).append("만");
		}
		return out.append(" 원").toString();
	}

	/** "1년 6개월"·"2년"·"6개월"(화면 periodText와 같다). */
	static String period(int months) {
		int y = months / 12;
		int m = months % 12;
		String out = (y > 0 ? y + "년" : "") + (y > 0 && m > 0 ? " " : "") + (m > 0 ? m + "개월" : "");
		return out.isEmpty() ? "0개월" : out;
	}
}
