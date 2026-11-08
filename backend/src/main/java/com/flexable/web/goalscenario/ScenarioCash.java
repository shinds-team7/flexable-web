package com.flexable.web.goalscenario;

import java.math.BigDecimal;

import com.flexable.web.deposit.DepositService;
import com.flexable.web.savings.SavingsService;

/**
 * 목표 달성 시나리오의 시장과 무관한 저축 쪽 계산(policies §7-9): 적금·예금·CMA와, 3년이 넘는 기한의 재예치.
 * DB·시계를 모른다. 원 단위 정수, 나눗셈은 내림. 투자 유형(지수 ETF·주식)은 ScenarioMath가 맡는다.
 *
 * <p>첫 3년(36개월)은 고른 적금·예금·CMA의 현재 금리를 그대로 쓴다. 4·5년이면 3년 적금 만기금을 남은 기간 동안 예금 또는 CMA에 다시 맡기고
 * (재예치), 매달 넣던 돈은 남은 기간 새 적금 또는 CMA에 넣는다. 3년 뒤 금리는 현재 금리가 유지된다고 가정하며, {@code drop}이 0보다 크면 그만큼(%p)
 * 낮아진다고 가정한 결과를 낸다(0% 아래로는 내려가지 않음).
 */
final class ScenarioCash {

	/** 첫 단계 길이(개월). 적금 만기가 3년까지라 이보다 긴 기한은 다시 맡긴다. */
	static final int FIRST_STAGE = 36;
	/** 묶어 두는 상품(예금·적금)이 CMA보다 묶는 1년당 이만큼(세후) 이상 나아야 묶는다. 못 미치면 CMA에 둔다. */
	static final long LOCK_GAIN_PER_YEAR = 10_000;
	/** 금리 하락 가정의 폭(%p). */
	static final BigDecimal RATE_DROP = new BigDecimal("1.00");

	/** 연 %와 월복리 여부. */
	record Rate(BigDecimal percent, boolean compound) {
	}

	/** 목돈을 둔 곳. */
	enum Place {
		DEPOSIT, CMA
	}

	/** 목돈의 기한 말 세후 금액과 첫 단계에 둔 곳. */
	record Lump(long finalAmount, Place place) {
	}

	private final int months;
	private final Rate saving;
	private final Rate deposit;
	private final Rate saving2;
	private final Rate deposit2;
	private final BigDecimal cma;
	private final BigDecimal drop;

	/**
	 * @param saving 첫 단계(최대 36개월) 적금 금리 — 필수
	 * @param deposit 첫 단계 목돈을 맡길 예금 금리 — 없으면 목돈은 CMA
	 * @param saving2 재예치 기간(기한 − 36개월) 새 적금 금리 — 없으면 CMA
	 * @param deposit2 재예치 기간 예금 금리 — 없으면 CMA
	 * @param drop 3년 뒤 금리에서 뺄 %p(0이면 현재 금리 유지)
	 */
	ScenarioCash(int months, Rate saving, Rate deposit, Rate saving2, Rate deposit2, BigDecimal cma, BigDecimal drop) {
		this.months = months;
		this.saving = saving;
		this.deposit = deposit;
		this.saving2 = saving2;
		this.deposit2 = deposit2;
		this.cma = cma;
		this.drop = drop;
	}

	/** 3년 이하·초기 자금 없음처럼 적금과 CMA만 쓰는 단순한 경우. */
	static ScenarioCash simple(int months, BigDecimal savingPercent, boolean savingCompound, BigDecimal cmaPercent) {
		return new ScenarioCash(months, new Rate(savingPercent, savingCompound), null, null, null, cmaPercent, BigDecimal.ZERO);
	}

	/** 같은 조건에서 3년 뒤 금리만 drop(%p) 낮춘 계산기. */
	ScenarioCash withDrop(BigDecimal newDrop) {
		return new ScenarioCash(months, saving, deposit, saving2, deposit2, cma, newDrop);
	}

	boolean longTerm() {
		return months > FIRST_STAGE;
	}

	/** 매달 monthly를 적금에 넣었을 때 기한 말 세후 금액. 4·5년이면 3년 만기금을 재예치하고 남은 기간은 새 적금(또는 CMA)에 넣는다. */
	long savings(long monthly) {
		if (monthly <= 0) {
			return 0;
		}
		int first = Math.min(months, FIRST_STAGE);
		long matured = SavingsService.maturity(monthly, first, saving.percent(), saving.compound()).finalAmount();
		if (!longTerm()) {
			return matured;
		}
		int rest = months - FIRST_STAGE;
		return rolledOver(matured, rest).finalAmount() + newSavings(monthly, rest);
	}

	/** 매달 monthly를 CMA에 넣었을 때 기한 말 세후 금액(3년 뒤부터 금리 하락 가정이 있으면 반영). */
	long cma(long monthly) {
		if (monthly <= 0) {
			return 0;
		}
		return ScenarioMath.cmaStaged(monthly, months, cma, later(cma), FIRST_STAGE).finalAmount();
	}

	/** 처음 모은 돈 중 저축 몫(적금·CMA 비중과 투자 몫 반올림 나머지)을 예금 또는 CMA에 두었을 때 기한 말 세후 금액과 첫 단계에 둔 곳. */
	Lump lump(long amount) {
		if (amount <= 0) {
			return new Lump(0, null);
		}
		int first = Math.min(months, FIRST_STAGE);
		long cmaWay = ScenarioMath.cmaLump(amount, first, cma).finalAmount();
		Lump stage1 = new Lump(cmaWay, Place.CMA);
		if (deposit != null) {
			long locked = DepositService.maturity(amount, first, deposit.percent(), deposit.compound()).finalAmount();
			if (worthLocking(locked, cmaWay, first)) {
				stage1 = new Lump(locked, Place.DEPOSIT);
			}
		}
		if (!longTerm()) {
			return stage1;
		}
		return new Lump(rolledOver(stage1.finalAmount(), months - FIRST_STAGE).finalAmount(), stage1.place());
	}

	/** 3년 만기금(또는 첫 단계 끝 금액)을 남은 기간 예금 또는 CMA에 다시 맡긴 결과. */
	private Lump rolledOver(long amount, int rest) {
		long cmaWay = ScenarioMath.cmaLump(amount, rest, later(cma)).finalAmount();
		Rate d = later(deposit2);
		if (d == null) {
			return new Lump(cmaWay, Place.CMA);
		}
		long locked = DepositService.maturity(amount, rest, d.percent(), d.compound()).finalAmount();
		return worthLocking(locked, cmaWay, rest) ? new Lump(locked, Place.DEPOSIT) : new Lump(cmaWay, Place.CMA);
	}

	/** 남은 기간 매달 monthly를 새 적금에 넣은 만기. 이득이 CMA보다 묶는 1년당 1만 원 미만이면 CMA에 넣은 결과. */
	private long newSavings(long monthly, int rest) {
		long cmaWay = ScenarioMath.cmaStaged(monthly, rest, later(cma), later(cma), rest).finalAmount();
		Rate s = later(saving2);
		if (s == null) {
			return cmaWay;
		}
		long locked = SavingsService.maturity(monthly, rest, s.percent(), s.compound()).finalAmount();
		return worthLocking(locked, cmaWay, rest) ? locked : cmaWay;
	}

	/** (묶는 쪽 − CMA쪽) 세후 이득이 묶는 1년당 LOCK_GAIN_PER_YEAR 이상인지. */
	static boolean worthLocking(long locked, long cmaWay, int lockMonths) {
		return (locked - cmaWay) * 12 >= LOCK_GAIN_PER_YEAR * lockMonths;
	}

	private BigDecimal later(BigDecimal percent) {
		BigDecimal v = percent.subtract(drop);
		return v.signum() < 0 ? BigDecimal.ZERO : v;
	}

	private Rate later(Rate r) {
		return r == null ? null : new Rate(later(r.percent()), r.compound());
	}
}
