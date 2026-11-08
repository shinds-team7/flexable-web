package com.flexable.web.policysavings;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.util.List;
import java.util.Map;

import org.springframework.stereotype.Service;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.policysavings.YouthFutureCalculator.Reject;
import com.flexable.web.policysavings.YouthFutureCalculator.Result;
import com.flexable.web.policysavings.YouthFutureCalculator.Type;

/** 정책 적금(청년미래적금) 규칙과 계산(policies §9). 규칙은 코드에 둔다. 근거와 기준일은 신한은행 공식 상품설명서다. */
@Service
public class PolicySavingsService {

	static final String CODE = "YOUTH_FUTURE";
	static final String RULES_VERSION = "youth-future-2026-06-22";
	static final String VERIFICATION = "UNVERIFIED";
	static final String SOURCE_URL = "https://img.shinhan.com/sbank2016/seol/20260602000000540001LC000030.PDF";

	static final List<String> ASSUMPTIONS = List.of(
			"신한은행 공식 상품설명서(2026-06-22 기준)를 바탕으로 계산해요. 다른 은행은 금리와 기여금 이자가 다를 수 있어요.",
			"이자는 납입한 건마다 만기까지의 일수로 계산하고, 1년은 365일로 봐요(윤년도 같아요).",
			"정부기여금은 납입한 달의 말일에 은행에 들어온다고 가정하고, 기본금리 이자만 붙여요.",
			"이자는 건마다 원 미만을 버리고, 만기까지 유지해 기여금을 모두 받는다고 봐요.",
			"중도해지, 소득 심사 결과, 재직 요건은 계산하지 않아요.");

	static final String NOTICE = "공식 안내 기준으로 계산한 추정이에요. 일수 기준과 기여금 입금일은 확인 중이라 실제 금액과 다를 수 있어요. 자격과 금리는 신청할 때 꼭 확인해 주세요.";

	static final List<String> CHECKLIST = List.of("만 19~34세인가요?", "공고문의 소득 기준을 확인했나요?",
			"소득정보 제공 동의와 서류를 기간 안에 낼 수 있나요?");

	public record Rules(String code, String name, int termMonths, long maxMonthly,
			Map<String, Integer> contributionRates, boolean contributionEarnsInterest, boolean taxFree,
			String rulesVersion, String verificationStatus, String sourceUrl, String asOf, List<String> checklist,
			List<String> assumptions, String notice, boolean isSample) {
	}

	public record SimulateRequest(LocalDate joinDate, Long monthly, Integer termMonths, Type type, BigDecimal baseRate,
			BigDecimal bonusRate) {
	}

	/** averageSavingsComparison은 평균 금리 출처가 없어 늘 null이다. */
	public record Simulation(LocalDate maturityDate, long principal, long govContribution, long ownInterest,
			long contributionInterest, long interestPreTax, long tax, long total, Object averageSavingsComparison,
			String rulesVersion, String verificationStatus, List<String> assumptions, String notice,
			boolean isSample) {
	}

	public Rules rules(String code) {
		requireCode(code);
		return new Rules(CODE, "청년미래적금", YouthFutureCalculator.TERM_MONTHS, YouthFutureCalculator.MAX_MONTHLY,
				Map.of("GENERAL", Type.GENERAL.contributionRate, "PREFERRED", Type.PREFERRED.contributionRate), true,
				true, RULES_VERSION, VERIFICATION, SOURCE_URL, "2026-06-22", CHECKLIST, ASSUMPTIONS, NOTICE, false);
	}

	public Simulation simulate(String code, SimulateRequest r) {
		requireCode(code);
		if (r.joinDate() == null || r.monthly() == null || r.type() == null || r.baseRate() == null
				|| r.bonusRate() == null) {
			throw new ApiException(ErrorCode.VALIDATION_FAILED);
		}
		int term = r.termMonths() == null ? YouthFutureCalculator.TERM_MONTHS : r.termMonths();
		Reject reject = YouthFutureCalculator.check(r.monthly(), term, r.baseRate(), r.bonusRate());
		if (reject != null) {
			throw ApiException.invalid(reject.field, reject.message);
		}
		Result c = YouthFutureCalculator.calculate(r.joinDate(), r.monthly(), r.type(), r.baseRate(), r.bonusRate(),
				true);
		return new Simulation(c.maturityDate(), c.principal(), c.govContribution(), c.ownInterest(),
				c.contributionInterest(), c.interestPreTax(), c.tax(), c.total(), null, RULES_VERSION, VERIFICATION,
				ASSUMPTIONS, NOTICE, false);
	}

	private static void requireCode(String code) {
		if (!CODE.equals(code)) {
			throw new ApiException(ErrorCode.NOT_FOUND, "정책 적금을 찾지 못했어요");
		}
	}
}
