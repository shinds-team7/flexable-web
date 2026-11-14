package com.flexable.web.goalscenario;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.EnumMap;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.SplittableRandom;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.goalscenario.GoalScenarioDtos.Alternative;
import com.flexable.web.goalscenario.GoalScenarioDtos.Item;
import com.flexable.web.goalscenario.GoalScenarioDtos.MixItem;
import com.flexable.web.goalscenario.GoalScenarioDtos.Outcome;
import com.flexable.web.goalscenario.GoalScenarioDtos.Product;
import com.flexable.web.goalscenario.GoalScenarioDtos.Request;
import com.flexable.web.goalscenario.GoalScenarioDtos.Result;
import com.flexable.web.goalscenario.GoalScenarioDtos.Scenario;
import com.flexable.web.goalscenario.GoalScenarioDtos.SeriesPoint;
import com.flexable.web.goalscenario.Proposals.Plan;
import com.flexable.web.market.Board;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.MarketDtos.InstrumentView;
import com.flexable.web.market.MarketService;
import com.flexable.web.savings.SavingsService;
import com.flexable.web.savings.SavingsService.FixedCandidate;

/**
 * 목표 달성 시나리오(policies §7). 제안기(AI, 없으면 데모)가 정한 조합을 검증하고, 금액·확률은 모두 여기서 계산한다(ADR-3).
 * 계산 결과는 저장을 위해 30분만 메모리에 둔다(ScenarioResultCache, §7-8). 목표 이름은 로그에 남기지 않는다.
 */
@Service
public class GoalScenarioService {
	private static final Logger log = LoggerFactory.getLogger(GoalScenarioService.class);

	static final int PATHS = 2000;
	static final long SEED = 20261103L;
	static final int BLOCK = 12;
	static final int HISTORY = 60;
	/** 기한(개월) 범위(policies §7-1). */
	static final int MIN_MONTHS = 6;
	static final int MAX_MONTHS = 60;
	/** 유형당 보는 상품 수(계산에 쓰는 1순위 + 함께 볼 상품 최대 2개, 적금·지수 ETF만). */
	static final int CANDIDATES = 3;
	static final BigDecimal CMA_RATE = new BigDecimal("2.50");
	static final String NOTICE = "이 결과는 입력한 조건과 과거 자료·계산 모형을 바탕으로 AI와 계산 서버가 만든 추정 시나리오예요. "
			+ "실제 수익과 목표 달성 여부를 보장하지 않으며, 투자한 원금의 일부 또는 전부를 잃을 수 있어요. 자료 기준일과 계산 가정을 함께 확인해 주세요.";
	static final List<String> ASSUMPTIONS = List.of(
			"시작 금액은 첫 달 초에 한 번에, 월 금액은 매달 초에 비중대로 나눠 넣어요. 리밸런싱·중도 인출은 없어요.",
			"적금은 매달 같은 돈을 넣는 상품이라 시작 금액 중 적금 몫은 CMA 예시 금리 연 2.5%로 계산했어요.",
			"적금은 개인이 가입할 수 있는 은행 상품 중 기본금리가 가장 높은 상품을 골라 기본금리(우대금리 제외)로, CMA는 예시 금리 연 2.5%로 계산했어요.",
			"이자와 미국 지수 ETF 이익에는 15.4% 세금을 뺐어요. 국내 지수 ETF·주식은 세금을 넣지 않았어요.",
			"배당·매매 수수료는 넣지 않았어요.",
			"지수 ETF·주식은 지난 60개월의 월 수익률을 12개월 묶음으로 무작위로 이어 붙인 2,000가지 경우로 계산했어요.",
			"코스피 주식은 시가총액 상위 5종목에 같은 금액으로 나눠 넣는다고 가정했어요.");
	/** 적금 만기가 기한보다 짧을 때만 더하는 가정(policies §7-2). */
	static final String AFTER_MATURITY = "적금 만기가 기한보다 짧으면 만기에 받은 돈과 남은 달의 적금 몫을 CMA 예시 금리 연 2.5%로 계산했어요.";
	private static final List<ProductType> INVEST = List.of(ProductType.KR_INDEX_ETF, ProductType.US_INDEX_ETF, ProductType.KOSPI_TOP5);

	private final MarketService market;
	private final SavingsService savings;
	private final ObjectProvider<ScenarioProposer> proposer;
	private final ScenarioResultCache results;
	private final ScenarioAiQuota quota;
	private final GoalScenarioAiProperties aiProps;
	private final TypeRoleStore typeRoles;
	private final ScenarioPlanStore plans;

	GoalScenarioService(MarketService market, SavingsService savings, ObjectProvider<ScenarioProposer> proposer, ScenarioResultCache results,
			ScenarioAiQuota quota, GoalScenarioAiProperties aiProps, TypeRoleStore typeRoles, ScenarioPlanStore plans) {
		this.plans = plans;
		this.aiProps = aiProps;
		this.typeRoles = typeRoles;
		this.market = market;
		this.savings = savings;
		this.proposer = proposer;
		this.results = results;
		this.quota = quota;
	}

	/**
	 * 유형마다 계산에 쓰는 상품(KOSPI_TOP5는 5개, CMA는 이름만)과 투자 상품의 60개월 월 수익률.
	 * moreSavings·moreItems는 함께 볼 상품이고 금액 계산에 쓰지 않는다. returns에는 함께 볼 지수 ETF의 수익률도 들어 있다.
	 */
	private record Picked(Map<ProductType, List<Item>> items, FixedCandidate saving, int savingTerm, Map<String, BigDecimal[]> returns,
			List<FixedCandidate> moreSavings, Map<ProductType, List<Item>> moreItems) {
	}

	/**
	 * 쓸 조합과, 데모로 바꿨다면 그 이유(AI면 null), 회원이면 남은 AI 횟수, 이전 AI 조합을 다시 썼는지.
	 * path는 시간 로그용 분류다: ai-short(미리 만든 유형 해설, #417)·ai-full·reused·demo.
	 */
	private record Chosen(List<Plan> plans, String fallbackReason, GoalScenarioDtos.AiUsage aiUsage, boolean reused, String path) {
	}

	/** userId는 로그인한 회원이면 웹 회원 번호, 비회원이면 null(데모 조합, GUEST). 요청 중에는 AI를 부르지 않는다(#431). */
	Result calculate(Request req, Long userId) {
		validate(req);
		long start = req.startAmount();
		long monthly = req.monthlyBudget();
		int months = req.months();
		Long target = req.targetAmount();

		long started = System.nanoTime();
		// 기준일 = 수집된 마지막 거래일. 수익률은 그 직전 달까지 60개월
		LocalDate asOf = Optional.ofNullable(market.status().pricesAsOf()).orElseThrow(() -> unavailable(ProductType.KR_INDEX_ETF.name()));
		YearMonth last = YearMonth.from(asOf).minusMonths(1);
		Picked picked = pick(months, last);
		long pickedAt = System.nanoTime();
		int[][] draws = draws(blocks(months));
		Map<String, BigDecimal[]> factors = new HashMap<>();
		Map<String, BigDecimal[]> growths = new HashMap<>();
		for (ProductType t : INVEST) {
			picked.items().get(t).forEach(i -> {
				factors.put(i.code(), factors(picked.returns().get(i.code()), draws, months));
				growths.put(i.code(), growths(picked.returns().get(i.code()), draws, months));
			});
		}
		long drawnAt = System.nanoTime();

		Chosen chosen = choose(start, monthly, months, target, asOf, userId, picked);
		long choseAt = System.nanoTime();
		List<Scenario> scenarios = new ArrayList<>();
		for (Plan plan : chosen.plans()) {
			scenarios.add(scenario(plan, start, monthly, months, target, picked, factors, growths, draws));
		}
		long calculatedAt = System.nanoTime();
		// 단계별 시간만 남긴다(#417·#431). 금액·기한·회원 정보는 남기지 않는다(policies §7-6)
		log.info("goal scenario timing: path={} pickMs={} drawMs={} chooseMs={} calcMs={} totalMs={}", chosen.path(), ms(started, pickedAt),
				ms(pickedAt, drawnAt), ms(drawnAt, choseAt), ms(choseAt, calculatedAt), ms(started, calculatedAt));
		List<String> assumptions = picked.savingTerm() < months
				? java.util.stream.Stream.concat(ASSUMPTIONS.stream(), java.util.stream.Stream.of(AFTER_MATURITY)).toList()
				: ASSUMPTIONS;
		Result result = new Result(null, start, monthly, months, target, chosen.fallbackReason() == null ? "AI" : "DEMO", chosen.fallbackReason(), asOf,
				last.minusMonths(HISTORY - 1).toString(), last.toString(), PATHS, SEED, products(picked), scenarios, assumptions, NOTICE, true,
				chosen.aiUsage(), chosen.reused());
		return results.remember(result);
	}

	static void validate(Request req) {
		ScenarioBudget.validateStart(req.startAmount());
		ScenarioBudget.validateMonthly(req.monthlyBudget());
		if (req.months() == null || req.months() < MIN_MONTHS || req.months() > MAX_MONTHS) {
			throw ApiException.invalid("months", "기한은 6개월부터 5년까지 정할 수 있어요");
		}
		ScenarioBudget.validateTarget(req.targetAmount());
	}

	/**
	 * worker가 미리 만든 이 기한의 AI 조합을 검증해 쓰고, 쓸 수 없으면 데모 조합(§7-6). 요청 중에는 AI를 부르지 않는다(#431).
	 * 순서: 키 없음(AI_UNAVAILABLE) → 비회원(GUEST) → 같은 회원의 같은 조건 다시 보기(차감 없음) → 미리 만든 조합 없음(AI_PENDING)
	 * → 회원 하루 횟수(LIMIT) → 규칙 위반(AI_REJECTED).
	 */
	private Chosen choose(long start, long monthly, int months, Long target, LocalDate asOf, Long userId, Picked picked) {
		ScenarioProposer p = proposer.getIfAvailable();
		String reason;
		if (p == null || !p.enabled() || p.planVersion() == null) {
			reason = "AI_UNAVAILABLE";
		}
		else if (userId == null) {
			reason = "GUEST";
		}
		else {
			ProposalText.Facts facts = facts(months, picked);
			ScenarioAiQuota.Key key = new ScenarioAiQuota.Key(userId, start, monthly, months, target, asOf, p.planVersion());
			Optional<List<Plan>> reused = quota.cached(key).map(d -> Proposals.check(d, facts).plans());
			if (reused.isPresent() && reused.get() != null) {
				return new Chosen(reused.get(), null, usage(userId), true, "reused");
			}
			PlanSubject subject = planSubject(months, picked);
			Optional<ScenarioPlanStore.Stored> stored = plans.find(p.planVersion(), months, subject.fingerprint());
			if (stored.isEmpty()) {
				reason = "AI_PENDING";
			}
			else {
				Proposals.Checked checked = Proposals.check(stored.get().drafts(), facts);
				if (checked.plans() == null) {
					log.warn("goal scenario stored plan rejected: {}", checked.logLine(aiProps.logRejected()));
					reason = "AI_REJECTED";
				}
				else {
					ScenarioAiQuota.Reserve r = quota.reserve(userId);
					if (r == ScenarioAiQuota.Reserve.GONE) {
						// 토큰은 유효하지만 회원이 없다(탈퇴). 다른 회원 API와 같이 401
						throw new ApiException(ErrorCode.UNAUTHORIZED);
					}
					if (r == ScenarioAiQuota.Reserve.OK) {
						quota.cache(key, stored.get().drafts(), stored.get().model());
						return new Chosen(checked.plans(), null, usage(userId), false, "ai");
					}
					reason = "LIMIT";
				}
			}
		}
		return new Chosen(Proposals.validate(Proposals.DEMO).orElseThrow(() -> new IllegalStateException("데모 조합이 규칙에 맞지 않아요")), reason,
				userId == null ? null : usage(userId), false, "demo");
	}

	private static long ms(long from, long to) {
		return (to - from) / 1_000_000;
	}

	/**
	 * AI에게 보낸 사실(§7-6): 문구 속 숫자는 이 값과 같을 때만 허용한다. 상품 이름(함께 볼 상품 포함)·기한·적금·CMA 금리·세율 15.4%·통계.
	 * 금액은 AI에게 보내지 않으므로(#431) 금액 숫자는 늘 걸린다.
	 */
	static ProposalText.Facts facts(int months, Picked picked) {
		java.util.Set<String> names = new java.util.HashSet<>();
		names.add(picked.saving().name());
		names.add(picked.saving().company());
		picked.items().values().forEach(items -> items.forEach(i -> names.add(i.name())));
		picked.moreItems().values().forEach(items -> items.forEach(i -> names.add(i.name())));
		List<BigDecimal> percents = new ArrayList<>(List.of(picked.saving().baseRate(), CMA_RATE, new BigDecimal("15.4")));
		for (FixedCandidate more : picked.moreSavings()) {
			names.add(more.name());
			names.add(more.company());
			percents.add(more.baseRate());
		}
		names.remove(null);
		List<ScenarioProposer.TypeStat> sent = stats(picked, months);
		return new ProposalText.Facts(0, 0, months, names, percents,
				java.util.Map.of(ProposalText.StatKind.MEAN, statPercents(sent, ScenarioProposer.TypeStat::meanMonthlyReturn, ScenarioProposer.AltStat::meanMonthlyReturn),
						ProposalText.StatKind.VOLATILITY, statPercents(sent, ScenarioProposer.TypeStat::monthlyVolatility, ScenarioProposer.AltStat::monthlyVolatility),
						ProposalText.StatKind.DRAWDOWN, statPercents(sent, ScenarioProposer.TypeStat::maxDrawdown, ScenarioProposer.AltStat::maxDrawdown)));
	}

	/** 소수로 보낸 통계(0.05)를 문구와 대조할 %의 절댓값(5.00)으로 바꾼다. */
	private static List<BigDecimal> statPercents(List<ScenarioProposer.TypeStat> stats,
			java.util.function.Function<ScenarioProposer.TypeStat, String> field, java.util.function.Function<ScenarioProposer.AltStat, String> altField) {
		return java.util.stream.Stream.concat(stats.stream().map(field), stats.stream().flatMap(t -> t.alternatives().stream()).map(altField))
			.filter(java.util.Objects::nonNull).map(v -> new BigDecimal(v).movePointRight(2).abs()).toList();
	}

	private GoalScenarioDtos.AiUsage usage(long userId) {
		return new GoalScenarioDtos.AiUsage(quota.limitPerDay(userId), quota.remaining(userId));
	}

	/** AI에게 보내는 유형별 사실(§7-6). 투자 유형은 지난 60개월 월 수익률의 평균·표준편차·최대 하락. 코스피 5종목은 같은 비중 평균. */
	private static List<ScenarioProposer.TypeStat> stats(Picked picked, int months) {
		List<ScenarioProposer.TypeStat> out = new ArrayList<>();
		FixedCandidate s = picked.saving();
		String term = picked.savingTerm() < months
				? ", 만기 " + picked.savingTerm() + "개월, 만기 뒤 남은 " + (months - picked.savingTerm()) + "개월은 CMA 예시 금리로 계산"
				: ", 만기 " + picked.savingTerm() + "개월";
		out.add(new ScenarioProposer.TypeStat("SAVINGS", "은행 정액적립식 적금(" + s.company() + " " + s.name() + ")" + term + ", 금리 확정, 이자 15.4% 과세",
				rate(s), null, null, null, savingAlternatives(picked)));
		out.add(new ScenarioProposer.TypeStat("CMA", "수시 입출금 CMA, 예시 금리, 이자 15.4% 과세", CMA_RATE.toPlainString(), null, null, null, List.of()));
		for (ProductType t : INVEST) {
			List<BigDecimal[]> series = picked.items().get(t).stream().map(i -> picked.returns().get(i.code())).toList();
			BigDecimal[] avg = averageSeries(series);
			String name = picked.items().get(t).stream().map(Item::name).reduce((a, b) -> a + "·" + b).orElse("");
			String desc = switch (t) {
				case KR_INDEX_ETF -> "국내 대표 지수 ETF(" + name + "), 비과세";
				case US_INDEX_ETF -> "미국 대표 지수 ETF(" + name + ", 국내 상장, 원화), 이익에 15.4% 과세";
				default -> "코스피 시가총액 상위 다섯 종목(" + name + ")에 같은 금액, 비과세";
			};
			List<ScenarioProposer.AltStat> more = picked.moreItems().getOrDefault(t, List.of()).stream().map(i -> {
				BigDecimal[] r = picked.returns().get(i.code());
				return new ScenarioProposer.AltStat(i.name(), null, null, fmt(mean(r)), fmt(stdev(r)), fmt(maxDrawdown(r)));
			}).toList();
			out.add(new ScenarioProposer.TypeStat(t.name(), desc, null, fmt(mean(avg)), fmt(stdev(avg)), fmt(maxDrawdown(avg)), more));
		}
		return out;
	}

	private static List<ScenarioProposer.AltStat> savingAlternatives(Picked picked) {
		return picked.moreSavings().stream().map(m -> new ScenarioProposer.AltStat(m.name(), m.company(), rate(m), null, null, null)).toList();
	}

	/**
	 * 이 기한의 유형 해설 대상 다섯 개(#417). 투자 유형·CMA는 AI에게 보내는 유형 사실과 같고, 적금은 기한마다 다른 "남은 달" 대신
	 * 만기가 기한보다 짧은지(afterMaturity)만 담는다.
	 */
	private static List<TypeRoleSubject> subjects(Picked picked, int months) {
		List<TypeRoleSubject> out = new ArrayList<>();
		FixedCandidate s = picked.saving();
		out.add(TypeRoleSubject.of(ProductType.SAVINGS, new TypeRoleSubject.Input("SAVINGS",
				"은행 정액적립식 적금(" + s.company() + " " + s.name() + "), 만기 " + picked.savingTerm() + "개월, 금리 확정, 이자 15.4% 과세", rate(s), null,
				null, null, savingAlternatives(picked), picked.savingTerm() < months)));
		for (ScenarioProposer.TypeStat t : stats(picked, months)) {
			if (!t.type().equals(ProductType.SAVINGS.name())) {
				out.add(TypeRoleSubject.of(ProductType.valueOf(t.type()), new TypeRoleSubject.Input(t.type(), t.description(), t.ratePercent(),
						t.meanMonthlyReturn(), t.monthlyVolatility(), t.maxDrawdown(), t.alternatives(), null)));
			}
		}
		return out;
	}

	/** 미리 만들 유형 해설 대상과 그 해설을 검사할 사실(기한 60개월, 금액 없음). */
	record TypeRoleTarget(TypeRoleSubject subject, ProposalText.Facts facts) {
	}

	/**
	 * worker가 미리 만들 유형 해설 대상 전부(#417). 기한 6~60개월마다 고르는 적금과 만기 경우를 모으고, 같은 자료(지문)는 한 번만 둔다.
	 * 투자 유형 상품은 기한과 상관없어 한 번만 고른다.
	 */
	List<TypeRoleTarget> typeRoleTargets() {
		LocalDate asOf = Optional.ofNullable(market.status().pricesAsOf()).orElseThrow(() -> unavailable(ProductType.KR_INDEX_ETF.name()));
		InvestPick inv = invest(YearMonth.from(asOf).minusMonths(1));
		Map<Integer, List<FixedCandidate>> openFixed = new HashMap<>();
		Map<String, TypeRoleTarget> out = new java.util.LinkedHashMap<>();
		for (int months = MIN_MONTHS; months <= MAX_MONTHS; months++) {
			SavingPick sp;
			try {
				sp = saving(months, (term, n) -> openFixed.computeIfAbsent(term, t -> savings.openFixed(t, n)));
			}
			catch (ApiException e) {
				// 이 기한에 맞는 적금이 없으면 요청도 503이라 해설이 필요 없다
				continue;
			}
			Picked p = pick(sp, inv);
			ProposalText.Facts f = facts(MAX_MONTHS, p);
			for (TypeRoleSubject s : subjects(p, months)) {
				out.putIfAbsent(s.type() + ":" + s.fingerprint(), new TypeRoleTarget(s, f));
			}
		}
		return List.copyOf(out.values());
	}

	/** 기한 하나의 미리 만들 조합 대상(#431). input은 AI에게 보내는 값 전부이고 fingerprint는 그 JSON의 SHA-256이다. */
	record PlanSubject(ScenarioProposer.PlanInput input, String fingerprint) {
	}

	private static PlanSubject planSubject(int months, Picked picked) {
		ScenarioProposer.PlanInput input = new ScenarioProposer.PlanInput(months, stats(picked, months));
		return new PlanSubject(input, TypeRoleSubject.sha256(PLAN_JSON.writeValueAsString(input)));
	}

	private static final tools.jackson.databind.json.JsonMapper PLAN_JSON = tools.jackson.databind.json.JsonMapper.builder().build();

	/** worker가 미리 만들 조합 하나: 기한, 보낼 값·지문, 검사할 사실, 이 기한의 유형 해설 대상 다섯 개. */
	record PlanTarget(int months, PlanSubject subject, ProposalText.Facts facts, List<TypeRoleSubject> roles) {
	}

	/** 기한 6~60개월마다 미리 만들 조합(#431). 이 기한에 맞는 적금이 없으면(요청도 503) 뺀다. */
	List<PlanTarget> planTargets() {
		LocalDate asOf = Optional.ofNullable(market.status().pricesAsOf()).orElseThrow(() -> unavailable(ProductType.KR_INDEX_ETF.name()));
		InvestPick inv = invest(YearMonth.from(asOf).minusMonths(1));
		Map<Integer, List<FixedCandidate>> openFixed = new HashMap<>();
		List<PlanTarget> out = new ArrayList<>();
		for (int months = MIN_MONTHS; months <= MAX_MONTHS; months++) {
			SavingPick sp;
			try {
				sp = saving(months, (term, n) -> openFixed.computeIfAbsent(term, t -> savings.openFixed(t, n)));
			}
			catch (ApiException e) {
				continue;
			}
			Picked p = pick(sp, inv);
			out.add(new PlanTarget(months, planSubject(months, p), facts(months, p), subjects(p, months)));
		}
		return out;
	}

	private static String rate(FixedCandidate s) {
		return s.baseRate().setScale(2, RoundingMode.HALF_UP).toPlainString();
	}

	static BigDecimal[] averageSeries(List<BigDecimal[]> series) {
		int n = series.getFirst().length;
		BigDecimal[] out = new BigDecimal[n];
		for (int m = 0; m < n; m++) {
			BigDecimal sum = BigDecimal.ZERO;
			for (BigDecimal[] s : series) {
				sum = sum.add(s[m]);
			}
			out[m] = sum.divide(BigDecimal.valueOf(series.size()), ScenarioMath.MC);
		}
		return out;
	}

	static double mean(BigDecimal[] r) {
		double sum = 0;
		for (BigDecimal x : r) {
			sum += x.doubleValue();
		}
		return sum / r.length;
	}

	static double stdev(BigDecimal[] r) {
		double m = mean(r);
		double sq = 0;
		for (BigDecimal x : r) {
			sq += (x.doubleValue() - m) * (x.doubleValue() - m);
		}
		return Math.sqrt(sq / r.length);
	}

	/** 누적 가치의 직전 최고점 대비 가장 큰 하락(0 이상, 0.3 = 30%). */
	static double maxDrawdown(BigDecimal[] r) {
		double v = 1;
		double peak = 1;
		double worst = 0;
		for (BigDecimal x : r) {
			v *= 1 + x.doubleValue();
			peak = Math.max(peak, v);
			worst = Math.max(worst, 1 - v / peak);
		}
		return worst;
	}

	private static String fmt(double d) {
		return BigDecimal.valueOf(d).setScale(4, RoundingMode.HALF_UP).toPlainString();
	}

	/**
	 * 유형마다 시가총액 순으로 조건에 맞는 상품을 보고, 61개 월말 종가가 모두 있는 것만 고른다(policies §7-2).
	 * 상장한 지 5년이 안 된 종목은 건너뛰고 다음 순위를 쓴다. 다 건너뛰어 모자라면 503(field = 유형 이름).
	 * 적금·지수 ETF는 다음 순위를 함께 볼 상품으로 최대 2개까지 고른다. 모자라면 있는 만큼만 쓰고 503으로 만들지 않는다.
	 */
	private Picked pick(int months, YearMonth last) {
		return pick(saving(months, savings::openFixed), invest(last));
	}

	/** 기한에 맞춰 고른 적금 후보(1순위 + 함께 볼 상품)와 만기. */
	private record SavingPick(List<FixedCandidate> fixed, int term) {
	}

	/** 기한과 상관없이 고르는 투자 유형 상품과 그 수익률. */
	private record InvestPick(List<InstrumentView> kr, List<InstrumentView> us, List<InstrumentView> kospi, Map<String, BigDecimal[]> returns) {
	}

	/** 적금 만기는 기한 이하인 만기 중 조건에 맞는 상품이 있는 가장 긴 것(policies §7-2). openFixed는 (만기, 개수) → 후보. */
	private static SavingPick saving(int months, java.util.function.BiFunction<Integer, Integer, List<FixedCandidate>> openFixed) {
		List<FixedCandidate> fixed = List.of();
		int term = months;
		for (; term > 0; term--) {
			fixed = openFixed.apply(term, CANDIDATES);
			if (!fixed.isEmpty()) {
				break;
			}
		}
		if (fixed.isEmpty()) {
			throw new ApiException(ErrorCode.MARKET_UNAVAILABLE, "조건에 맞는 적금 공시가 아직 없어요", Map.of("field", "SAVINGS"));
		}
		return new SavingPick(fixed, term);
	}

	private InvestPick invest(YearMonth last) {
		Map<String, BigDecimal[]> returns = new HashMap<>();
		List<InstrumentView> etfs = market.board(Board.ETF).items();
		List<InstrumentView> kr = withHistory(etfs.stream().filter(i -> i.name().strip().endsWith("200")).toList(), 1, CANDIDATES, last, returns,
				ProductType.KR_INDEX_ETF);
		List<InstrumentView> us = withHistory(etfs.stream().filter(i -> i.name().strip().endsWith("S&P500")).toList(), 1, CANDIDATES, last, returns,
				ProductType.US_INDEX_ETF);
		List<InstrumentView> kospi = withHistory(market.board(Board.KOSPI).items().stream().filter(i -> !preferred(i.name())).toList(), 5, 5, last,
				returns, ProductType.KOSPI_TOP5);
		return new InvestPick(kr, us, kospi, returns);
	}

	private static Picked pick(SavingPick s, InvestPick inv) {
		List<FixedCandidate> fixed = s.fixed();
		int term = s.term();
		FixedCandidate saving = fixed.getFirst();
		List<InstrumentView> kr = inv.kr();
		List<InstrumentView> us = inv.us();
		List<InstrumentView> kospi = inv.kospi();
		Map<String, BigDecimal[]> returns = inv.returns();
		Map<ProductType, List<Item>> items = new EnumMap<>(ProductType.class);
		items.put(ProductType.SAVINGS, List.of(new Item(saving.productId(), saving.name(), saving.company())));
		items.put(ProductType.CMA, List.of(new Item(null, "CMA", null)));
		items.put(ProductType.KR_INDEX_ETF, List.of(item(kr.getFirst())));
		items.put(ProductType.US_INDEX_ETF, List.of(item(us.getFirst())));
		items.put(ProductType.KOSPI_TOP5, kospi.stream().map(GoalScenarioService::item).toList());
		Map<ProductType, List<Item>> more = new EnumMap<>(ProductType.class);
		more.put(ProductType.KR_INDEX_ETF, kr.stream().skip(1).map(GoalScenarioService::item).toList());
		more.put(ProductType.US_INDEX_ETF, us.stream().skip(1).map(GoalScenarioService::item).toList());
		return new Picked(items, saving, term, returns, fixed.subList(1, fixed.size()), more);
	}

	private static Item item(InstrumentView i) {
		return new Item(i.id(), i.name(), null);
	}

	/** 후보(시가총액 순) 중 수익률 자료가 모두 있는 앞의 max개. min개보다 적으면 503. 고른 것의 수익률은 returns에 담는다. */
	private List<InstrumentView> withHistory(List<InstrumentView> candidates, int min, int max, YearMonth last, Map<String, BigDecimal[]> returns,
			ProductType type) {
		List<InstrumentView> out = new ArrayList<>();
		for (InstrumentView i : candidates) {
			if (out.size() == max) {
				break;
			}
			Optional<BigDecimal[]> r = monthlyReturns(i.id(), last);
			if (r.isPresent()) {
				returns.put(i.id(), r.get());
				out.add(i);
			}
		}
		if (out.size() < min) {
			throw unavailable(type.name());
		}
		return out;
	}

	/** 우선주(이름이 우·우B·우C로 끝남). */
	static boolean preferred(String name) {
		String n = name.strip();
		return n.endsWith("우") || n.endsWith("우B") || n.endsWith("우C");
	}

	private static ApiException unavailable(String field) {
		return new ApiException(ErrorCode.MARKET_UNAVAILABLE, "계산에 필요한 시세를 아직 모으지 않았어요", Map.of("field", field));
	}

	/** last 달까지 60개월 월 수익률. 61개 월말 종가 중 하나라도 없으면 빈 값. */
	private Optional<BigDecimal[]> monthlyReturns(String code, YearMonth last) {
		YearMonth first = last.minusMonths(HISTORY);
		Map<YearMonth, Long> monthEnd = new HashMap<>();
		for (DailyClose c : market.dailyCloses(code, first.atDay(1))) {
			YearMonth m = YearMonth.from(c.date());
			if (!m.isAfter(last)) {
				monthEnd.put(m, c.close()); // 날짜 오름차순이라 마지막 값이 월말 종가
			}
		}
		long[] closes = new long[HISTORY + 1];
		for (int i = 0; i <= HISTORY; i++) {
			Long c = monthEnd.get(first.plusMonths(i));
			if (c == null || c <= 0) {
				return Optional.empty();
			}
			closes[i] = c;
		}
		return Optional.of(returnsFromCloses(closes));
	}

	/** 월말 종가 n+1개 → 월 수익률 n개(종가 ÷ 전달 종가 − 1). */
	static BigDecimal[] returnsFromCloses(long[] closes) {
		BigDecimal[] r = new BigDecimal[closes.length - 1];
		for (int i = 1; i < closes.length; i++) {
			r[i - 1] = BigDecimal.valueOf(closes[i]).divide(BigDecimal.valueOf(closes[i - 1]), ScenarioMath.MC).subtract(BigDecimal.ONE);
		}
		return r;
	}

	/** 기한을 덮는 12개월 묶음 수 = ⌈개월 ÷ 12⌉. */
	static int blocks(int months) {
		return (months + BLOCK - 1) / BLOCK;
	}

	/** 경로마다 blocks개 묶음 시작 위치(0~48). 모든 상품·시나리오가 같은 값을 쓴다. 12·24·36개월은 바뀌기 전과 같은 순서다. */
	static int[][] draws(int blocks) {
		SplittableRandom rnd = new SplittableRandom(SEED);
		int starts = HISTORY - BLOCK + 1;
		int[][] out = new int[PATHS][blocks];
		for (int p = 0; p < PATHS; p++) {
			for (int y = 0; y < blocks; y++) {
				out[p][y] = rnd.nextInt(starts);
			}
		}
		return out;
	}

	/** 경로마다 매달 1원을 넣었을 때의 기한 말 배수. 묶음을 이어 붙인 뒤 앞에서 months개월만 쓴다. */
	static BigDecimal[] factors(BigDecimal[] returns, int[][] draws, int months) {
		BigDecimal[] out = new BigDecimal[draws.length];
		for (int p = 0; p < draws.length; p++) {
			out[p] = ScenarioMath.factor(Arrays.copyOf(path(returns, draws[p]), months));
		}
		return out;
	}

	/** 경로마다 시작 금액 1원의 기한 말 배수(성장 배수). 묶음을 이어 붙인 뒤 앞에서 months개월만 쓴다. */
	static BigDecimal[] growths(BigDecimal[] returns, int[][] draws, int months) {
		BigDecimal[] out = new BigDecimal[draws.length];
		for (int p = 0; p < draws.length; p++) {
			out[p] = ScenarioMath.growth(Arrays.copyOf(path(returns, draws[p]), months));
		}
		return out;
	}

	private static BigDecimal[] path(BigDecimal[] returns, int[] draw) {
		BigDecimal[] path = new BigDecimal[draw.length * BLOCK];
		for (int y = 0; y < draw.length; y++) {
			System.arraycopy(returns, draw[y], path, y * BLOCK, BLOCK);
		}
		return path;
	}

	/** 한 시나리오의 계산 조건. 유형별 월 금액·시작 금액 몫은 여기서 나눈다(§7-4). */
	record Inputs(Map<ProductType, Integer> mix, long start, long monthly, int months, int savingsTerm, BigDecimal savingsRate,
			boolean savingsCompound) {
		Map<ProductType, Long> monthlyParts() {
			return ScenarioMath.allocate(monthly, mix);
		}

		Map<ProductType, Long> startParts() {
			return ScenarioMath.allocateStart(start, mix);
		}

		/** 적금 몫의 시작 금액은 적금에 한 번에 넣을 수 없어 CMA 몫과 함께 CMA로 계산한다(§7-4). */
		long cmaStart() {
			Map<ProductType, Long> s = startParts();
			return s.getOrDefault(ProductType.SAVINGS, 0L) + s.getOrDefault(ProductType.CMA, 0L);
		}

		/** 넣은 돈 = 시작 금액 + 월 금액 × 개월. */
		long paid() {
			return start + monthly * months;
		}
	}

	/** 상품 하나에 넣는 시작 금액. 유형 몫을 상품 수로 나누고 내림으로 남은 돈은 첫 상품에 더한다(§7-4). */
	static long itemStart(long typeStart, int items, int index) {
		long each = typeStart / items;
		return index == 0 ? typeStart - each * (items - 1) : each;
	}

	/**
	 * 경로별 기한 말 금액(§7-3). 적금·CMA는 모든 경로에서 같고, 투자 유형은 경로 배수를 곱한다.
	 * itemFactors·itemGrowths는 유형마다 상품별 경로 배수(KOSPI_TOP5는 5개). n은 경로 수(투자가 없으면 1).
	 */
	static long[] finals(Inputs in, int n, Map<ProductType, List<BigDecimal[]>> itemFactors, Map<ProductType, List<BigDecimal[]>> itemGrowths) {
		Map<ProductType, Long> m = in.monthlyParts();
		Map<ProductType, Long> st = in.startParts();
		long fixed = 0;
		if (m.containsKey(ProductType.SAVINGS)) {
			fixed += savingsFinal(m.get(ProductType.SAVINGS), in.months(), in.savingsTerm(), in.savingsRate(), in.savingsCompound());
		}
		long cmaStart = in.cmaStart();
		long cmaMonthly = m.getOrDefault(ProductType.CMA, 0L);
		if (cmaStart > 0 || cmaMonthly > 0) {
			fixed += ScenarioMath.cma(cmaStart, cmaMonthly, in.months(), CMA_RATE).finalAmount();
		}
		long[] out = new long[n];
		Arrays.fill(out, fixed);
		for (ProductType t : INVEST) {
			Long amount = m.get(t);
			if (amount == null) {
				continue;
			}
			List<BigDecimal[]> fs = itemFactors.get(t);
			List<BigDecimal[]> gs = itemGrowths.get(t);
			long each = amount / fs.size();
			long typeStart = st.getOrDefault(t, 0L);
			for (int i = 0; i < fs.size(); i++) {
				long itemStart = itemStart(typeStart, fs.size(), i);
				for (int p = 0; p < n; p++) {
					out[p] += ScenarioMath.invest(each, itemStart, in.months(), fs.get(i)[p], gs.get(i)[p], t == ProductType.US_INDEX_ETF).finalAmount();
				}
			}
		}
		return out;
	}

	/**
	 * 적금 몫의 기한 말 금액(policies §7-2). 만기 = 기한이면 적금 만기 금액. 만기가 짧으면 만기 금액(세후)을 CMA 예시 금리로 옮기고
	 * 남은 달의 적금 몫도 매달 초 넣는다. 원래 CMA 비중과는 따로 계산하고, 세금은 이 부분 이자에만 매긴다.
	 */
	static long savingsFinal(long monthly, int months, int term, BigDecimal rate, boolean compound) {
		long matured = SavingsService.maturity(monthly, term, rate, compound).finalAmount();
		return term >= months ? matured : ScenarioMath.cma(matured, monthly, months - term, CMA_RATE).finalAmount();
	}

	/**
	 * 기한 말 결과(§7-5). values는 경로별 기한 말 금액, paid는 넣은 돈, target은 목표 금액(없으면 null).
	 * 투자가 없으면 확정형(FIXED), 있으면 범위(RANGE). highGain = 상위 10%(확정형은 확정 금액) − 넣은 돈.
	 */
	static Outcome outcome(long[] values, long paid, Long target, boolean invest) {
		int n = values.length;
		Integer chance = target == null ? null : ScenarioMath.bp(ScenarioMath.reached(values, target), n);
		int loss = ScenarioMath.bp((int) Arrays.stream(values).filter(v -> v < paid).count(), n);
		if (!invest) {
			return new Outcome("FIXED", values[0], null, null, null, values[0] - paid, chance, loss);
		}
		long[] sorted = values.clone();
		Arrays.sort(sorted);
		long high = sorted[ScenarioMath.quantileIndex(n, 9000)];
		return new Outcome("RANGE", null, sorted[ScenarioMath.quantileIndex(n, 1000)], sorted[ScenarioMath.quantileIndex(n, 5000)], high,
				high - paid, chance, loss);
	}

	/**
	 * 달마다(0 = 시작, 1..기한) 경로별 금액의 하위 10%·중간값·상위 10%(§7-5 그래프). 그 달에 끝낸다고 보고 세금을 뺀 값이고,
	 * 화면 그래프용이라 소수(double)로 계산해 원 단위 내림한다. 적금 이자는 만기 달에 붙는다. 마지막 달은 기한 말 결과(정확한 계산)로 바꾼다.
	 */
	static List<SeriesPoint> series(Inputs in, int n, Map<ProductType, List<BigDecimal[]>> itemReturns, int[][] draws, Outcome last) {
		int months = in.months();
		double[] fixed = fixedSeries(in);
		double[][] totals = new double[months + 1][n];
		for (int m = 0; m <= months; m++) {
			Arrays.fill(totals[m], fixed[m]);
		}
		Map<ProductType, Long> mp = in.monthlyParts();
		Map<ProductType, Long> st = in.startParts();
		for (ProductType t : INVEST) {
			Long amount = mp.get(t);
			if (amount == null) {
				continue;
			}
			List<BigDecimal[]> items = itemReturns.get(t);
			double each = amount / items.size();
			long typeStart = st.getOrDefault(t, 0L);
			boolean taxed = t == ProductType.US_INDEX_ETF;
			for (int i = 0; i < items.size(); i++) {
				double[] r = toDouble(items.get(i));
				double start = itemStart(typeStart, items.size(), i);
				for (int p = 0; p < n; p++) {
					int[] draw = draws[p];
					double f = 0;
					double g = 1;
					totals[0][p] += start;
					for (int m = 1; m <= months; m++) {
						double ret = r[draw[(m - 1) / BLOCK] + (m - 1) % BLOCK];
						f = (f + 1) * (1 + ret);
						g = g * (1 + ret);
						double value = each * f + start * g;
						if (taxed) {
							value -= Math.max(0, Math.floor((value - (each * m + start)) * 0.154));
						}
						totals[m][p] += value;
					}
				}
			}
		}
		List<SeriesPoint> out = new ArrayList<>();
		for (int m = 0; m <= months; m++) {
			double[] col = totals[m];
			Arrays.sort(col);
			out.add(new SeriesPoint(m, (long) Math.floor(col[ScenarioMath.quantileIndex(n, 1000)]),
					(long) Math.floor(col[ScenarioMath.quantileIndex(n, 5000)]), (long) Math.floor(col[ScenarioMath.quantileIndex(n, 9000)])));
		}
		if ("FIXED".equals(last.kind())) {
			out.set(months, new SeriesPoint(months, last.fixedAmount(), last.fixedAmount(), last.fixedAmount()));
		}
		else {
			out.set(months, new SeriesPoint(months, last.low(), last.median(), last.high()));
		}
		return out;
	}

	private static double[] toDouble(BigDecimal[] r) {
		double[] out = new double[r.length];
		for (int i = 0; i < r.length; i++) {
			out[i] = r[i].doubleValue();
		}
		return out;
	}

	/** 적금·CMA 몫의 달마다 금액(모든 경로에서 같다). 적금은 만기 전에는 넣은 돈, 만기 달에 만기 금액, 그 뒤는 CMA로 이어 간다. */
	static double[] fixedSeries(Inputs in) {
		int months = in.months();
		double[] out = new double[months + 1];
		Map<ProductType, Long> mp = in.monthlyParts();
		long sm = mp.getOrDefault(ProductType.SAVINGS, 0L);
		if (sm > 0) {
			int term = Math.min(in.savingsTerm(), months);
			long matured = SavingsService.maturity(sm, term, in.savingsRate(), in.savingsCompound()).finalAmount();
			long balance = 0;
			long interest = 0;
			for (int m = 1; m <= months; m++) {
				if (m < term) {
					out[m] += sm * m;
				}
				else if (m == term) {
					balance = matured;
					out[m] += matured;
				}
				else {
					balance += sm;
					long i = ScenarioMath.monthInterest(balance, CMA_RATE);
					balance += i;
					interest += i;
					out[m] += balance - ScenarioMath.tax(interest);
				}
			}
		}
		long cmaStart = in.cmaStart();
		long cmaMonthly = mp.getOrDefault(ProductType.CMA, 0L);
		out[0] += cmaStart;
		long balance = cmaStart;
		long interest = 0;
		for (int m = 1; m <= months; m++) {
			balance += cmaMonthly;
			long i = ScenarioMath.monthInterest(balance, CMA_RATE);
			balance += i;
			interest += i;
			out[m] += balance - ScenarioMath.tax(interest);
		}
		return out;
	}

	private Scenario scenario(Plan plan, long start, long monthly, int months, Long target, Picked picked, Map<String, BigDecimal[]> factors,
			Map<String, BigDecimal[]> growths, int[][] draws) {
		boolean invest = plan.mix().keySet().stream().anyMatch(ProductType::invest);
		int n = invest ? PATHS : 1;
		Map<ProductType, List<BigDecimal[]>> itemFactors = new EnumMap<>(ProductType.class);
		Map<ProductType, List<BigDecimal[]>> itemGrowths = new EnumMap<>(ProductType.class);
		Map<ProductType, List<BigDecimal[]>> itemReturns = new EnumMap<>(ProductType.class);
		for (ProductType t : INVEST) {
			itemFactors.put(t, picked.items().get(t).stream().map(i -> factors.get(i.code())).toList());
			itemGrowths.put(t, picked.items().get(t).stream().map(i -> growths.get(i.code())).toList());
			itemReturns.put(t, picked.items().get(t).stream().map(i -> picked.returns().get(i.code())).toList());
		}
		FixedCandidate s = picked.saving();
		Inputs in = new Inputs(plan.mix(), start, monthly, months, picked.savingTerm(), s.baseRate(), s.compound());
		Outcome outcome = outcome(finals(in, n, itemFactors, itemGrowths), in.paid(), target, invest);
		Map<ProductType, Long> mp = in.monthlyParts();
		Map<ProductType, Long> st = in.startParts();
		List<MixItem> mix = plan.mix().entrySet().stream()
			.map(e -> new MixItem(e.getKey(), e.getValue(), mp.get(e.getKey()), st.getOrDefault(e.getKey(), 0L))).toList();
		return new Scenario(plan.id(), plan.title(), plan.summary(), plan.explanation(), plan.parts(),
				ScenarioResultText.of(start, monthly, outcome, target, months), mix, monthly, in.paid(), outcome, series(in, n, itemReturns, draws, outcome));
	}

	private static List<Product> products(Picked picked) {
		List<Product> out = new ArrayList<>();
		for (ProductType t : ProductType.values()) {
			String rate = switch (t) {
				case SAVINGS -> rate(picked.saving());
				case CMA -> CMA_RATE.toPlainString();
				default -> null;
			};
			List<Alternative> more = t == ProductType.SAVINGS
					? picked.moreSavings().stream().map(m -> new Alternative(m.productId(), m.name(), m.company(), rate(m))).toList()
					: picked.moreItems().getOrDefault(t, List.of()).stream().map(i -> new Alternative(i.code(), i.name(), null, null)).toList();
			out.add(new Product(t, picked.items().get(t), rate, t == ProductType.CMA, more, t == ProductType.SAVINGS ? picked.savingTerm() : null));
		}
		return out;
	}
}
