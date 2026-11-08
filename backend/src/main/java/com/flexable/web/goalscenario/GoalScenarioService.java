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
import java.util.function.LongFunction;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.beans.factory.ObjectProvider;
import org.springframework.stereotype.Service;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.cashcatalog.CashCatalogService;
import com.flexable.web.deposit.DepositService;
import com.flexable.web.goalscenario.GoalScenarioDtos.Alternative;
import com.flexable.web.goalscenario.GoalScenarioDtos.Item;
import com.flexable.web.goalscenario.GoalScenarioDtos.InitialSaving;
import com.flexable.web.goalscenario.GoalScenarioDtos.MixItem;
import com.flexable.web.goalscenario.GoalScenarioDtos.Outcome;
import com.flexable.web.goalscenario.GoalScenarioDtos.Product;
import com.flexable.web.goalscenario.GoalScenarioDtos.RateAssumption;
import com.flexable.web.goalscenario.GoalScenarioDtos.RateDown;
import com.flexable.web.goalscenario.GoalScenarioDtos.Request;
import com.flexable.web.goalscenario.GoalScenarioDtos.Result;
import com.flexable.web.goalscenario.GoalScenarioDtos.Scenario;
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
	static final int REACH_BP = 8000;
	/** 유형당 보는 상품 수(계산에 쓰는 1순위 + 함께 볼 상품 최대 2개, 적금·지수 ETF만). */
	static final int CANDIDATES = 3;
	/** CMA 공시가 없을 때 쓰는 예시 금리(연 %). 공시가 있으면 기본금리의 중간값을 쓴다(§7-2). */
	static final BigDecimal CMA_RATE = new BigDecimal("2.50");
	/** 추천 플랜을 고를 때 허용하는 원금 손실 비율(만분율) 상한(§7-5). */
	static final int RECOMMEND_LOSS_BP = 1000;
	static final int MAX_YEARS = 5;
	static final long MAX_INITIAL = 1_000_000_000L;
	static final String NOTICE = "이 결과는 입력한 조건과 과거 자료·계산 모형을 바탕으로 AI와 계산 서버가 만든 추정 시나리오예요. "
			+ "실제 수익과 목표 달성 여부를 보장하지 않으며, 투자한 원금의 일부 또는 전부를 잃을 수 있어요. 자료 기준일과 계산 가정을 함께 확인해 주세요.";
	static final List<String> ASSUMPTIONS = List.of(
			"시작 금액은 0원이고 매달 초에 같은 금액을 비중대로 나눠 넣어요. 리밸런싱·중도 인출은 없어요.",
			"적금은 개인이 가입할 수 있는 은행 상품 중 기본금리가 가장 높은 상품을 골라 기본금리(우대금리 제외)로, CMA는 예시 금리 연 2.5%로 계산했어요.",
			"이자와 미국 지수 ETF 이익에는 15.4% 세금을 뺐어요. 국내 지수 ETF·주식은 세금을 넣지 않았어요.",
			"배당·매매 수수료는 넣지 않았어요.",
			"지수 ETF·주식은 지난 60개월의 월 수익률을 12개월 묶음으로 무작위로 이어 붙인 2,000가지 경우로 계산했어요.",
			"코스피 주식은 시가총액 상위 5종목에 같은 금액으로 나눠 넣는다고 가정했어요.");
	private static final String CMA_REAL_ASSUMPTION = "적금은 개인이 가입할 수 있는 은행 상품 중 기본금리가 가장 높은 상품을 골라 기본금리(우대금리 제외)로, "
			+ "CMA는 수집한 공시 기본금리의 중간값으로 계산했어요.";
	private static final String INITIAL_ASSUMPTION = "처음 모은 돈은 플랜 비중대로 나눠, 투자 몫은 처음부터 시장에 넣고 저축 몫은 예금과 CMA 중 기한 말 세후 금액이 나은 쪽에 맡겨요"
			+ "(예금의 이득이 묶는 1년당 세후 1만 원보다 적으면 CMA). 적금은 매달 넣는 상품이라 처음 돈 비교에서 뺐어요.";
	private static final String LONG_TERM_ASSUMPTION = "3년을 넘는 기한은 3년 적금 만기금을 남은 기간 예금(또는 CMA)에 다시 맡기고, 매달 넣던 돈은 남은 기간 새 적금(또는 CMA)에 넣어요. "
			+ "3년 뒤 금리는 지금 금리가 그대로 유지된다고 가정했어요. 금리가 1%포인트 낮아지면 필요한 월 금액이 얼마가 되는지도 함께 보여 줘요.";
	private static final List<ProductType> INVEST = List.of(ProductType.KR_INDEX_ETF, ProductType.US_INDEX_ETF, ProductType.KOSPI_TOP5);

	private final MarketService market;
	private final SavingsService savings;
	private final ObjectProvider<ScenarioProposer> proposer;
	private final ScenarioResultCache results;
	private final ScenarioAiQuota quota;
	private final GoalScenarioAiProperties aiProps;
	private final DepositService deposits;
	private final CashCatalogService cashCatalog;

	GoalScenarioService(MarketService market, SavingsService savings, DepositService deposits, CashCatalogService cashCatalog,
			ObjectProvider<ScenarioProposer> proposer, ScenarioResultCache results, ScenarioAiQuota quota, GoalScenarioAiProperties aiProps) {
		this.aiProps = aiProps;
		this.deposits = deposits;
		this.cashCatalog = cashCatalog;
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
	private record Picked(Map<ProductType, List<Item>> items, FixedCandidate saving, Map<String, BigDecimal[]> returns,
			List<FixedCandidate> moreSavings, Map<ProductType, List<Item>> moreItems, DepositService.FixedCandidate deposit,
			FixedCandidate saving2, DepositService.FixedCandidate deposit2, BigDecimal cmaRate, boolean cmaSample) {
	}

	/** 쓸 조합과, 데모로 바꿨다면 그 이유(AI면 null), 회원이면 남은 AI 횟수, 이전 AI 조합을 다시 썼는지. */
	private record Chosen(List<Plan> plans, String fallbackReason, GoalScenarioDtos.AiUsage aiUsage, boolean reused) {
	}

	/** userId는 로그인한 회원이면 웹 회원 번호, 비회원이면 null(데모 조합, GUEST). */
	Result calculate(Request req, Long userId) {
		String name = validate(req);
		long target = req.targetAmount();
		long initial = initialAmount(req);
		int years = req.years();
		int months = years * 12;

		// 기준일 = 수집된 마지막 거래일. 수익률은 그 직전 달까지 60개월
		LocalDate asOf = Optional.ofNullable(market.status().pricesAsOf()).orElseThrow(() -> unavailable(ProductType.KR_INDEX_ETF.name()));
		YearMonth last = YearMonth.from(asOf).minusMonths(1);
		Picked picked = pick(months, last);
		int[][] draws = draws(years);
		Map<String, BigDecimal[]> factors = new HashMap<>();
		Map<String, BigDecimal[]> lumpFactors = new HashMap<>();
		for (ProductType t : INVEST) {
			picked.items().get(t).forEach(i -> {
				factors.put(i.code(), factors(picked.returns().get(i.code()), draws));
				lumpFactors.put(i.code(), lumpFactors(picked.returns().get(i.code()), draws));
			});
		}

		Chosen chosen = choose(target, years, months, asOf, userId, picked);
		ScenarioCash cash = cashModel(picked, months, BigDecimal.ZERO);
		ScenarioCash down = months > ScenarioCash.FIRST_STAGE ? cashModel(picked, months, ScenarioCash.RATE_DROP) : null;
		List<String> styles = styles(chosen.plans());
		List<Scenario> scenarios = new ArrayList<>();
		for (int i = 0; i < chosen.plans().size(); i++) {
			scenarios.add(scenario(chosen.plans().get(i), styles.get(i), target, months, initial, picked, factors, lumpFactors, cash, down));
		}
		Alternative initialDeposit = initial > 0 && picked.deposit() != null
				? new Alternative(picked.deposit().productId(), picked.deposit().name(), picked.deposit().company(), picked.deposit().baseRate().setScale(2, RoundingMode.HALF_UP).toPlainString())
				: null;
		Result result = new Result(null, name, target, years, months, chosen.fallbackReason() == null ? "AI" : "DEMO", chosen.fallbackReason(), asOf,
				last.minusMonths(HISTORY - 1).toString(), last.toString(), PATHS, SEED, new BigDecimal("0.8"),
				products(picked), scenarios, assumptions(initial, months, picked.cmaSample()), NOTICE, true, chosen.aiUsage(), chosen.reused(),
				initial, recommend(scenarios), down == null ? null : new RateAssumption(ScenarioCash.FIRST_STAGE, ScenarioCash.RATE_DROP.toPlainString()),
				initialDeposit);
		return results.remember(result);
	}

	/** 앞뒤 공백을 뺀 이름을 돌려준다. */
	static String validate(Request req) {
		String name = req.name() == null ? "" : req.name().strip();
		if (name.isEmpty() || name.length() > 20) {
			throw ApiException.invalid("name", "목표 이름은 1~20자로 적어 주세요");
		}
		if (req.targetAmount() == null || req.targetAmount() < 1_000_000 || req.targetAmount() > 1_000_000_000) {
			throw ApiException.invalid("targetAmount", "목표 금액은 100만 원부터 10억 원까지 넣을 수 있어요");
		}
		if (req.years() == null || req.years() < 1 || req.years() > MAX_YEARS) {
			throw ApiException.invalid("years", "기한은 1년부터 5년까지 골라 주세요");
		}
		initialAmount(req);
		return name;
	}

	/** 처음 모은 돈. 비우면 0원. 0원~10억 원. */
	static long initialAmount(Request req) {
		Long v = req.initialAmount();
		if (v == null) {
			return 0;
		}
		if (v < 0 || v > MAX_INITIAL) {
			throw ApiException.invalid("initialAmount", "처음 모은 돈은 0원부터 10억 원까지 넣을 수 있어요");
		}
		return v;
	}

	/** 투자 비중이 낮은 순서로 SAFE·BALANCED·AGGRESSIVE(같으면 제안 순서). 시나리오는 3개다. */
	static List<String> styles(List<Plan> plans) {
		String[] names = { "SAFE", "BALANCED", "AGGRESSIVE" };
		List<Integer> order = new ArrayList<>();
		for (int i = 0; i < plans.size(); i++) {
			order.add(i);
		}
		order.sort(java.util.Comparator.comparingInt((Integer i) -> plans.get(i).mix().entrySet().stream()
			.filter(e -> e.getKey().invest()).mapToInt(Map.Entry::getValue).sum()).thenComparingInt(i -> i));
		String[] out = new String[plans.size()];
		for (int rank = 0; rank < order.size(); rank++) {
			out[order.get(rank)] = names[Math.min(rank, names.length - 1)];
		}
		return List.of(out);
	}

	/**
	 * 서버가 계산 결과로 고르는 가장 합리적인 플랜(§7-5). 목표에 닿고 원금 손실 비율이 10% 이하인 플랜 중 필요 월 금액이 가장 작은 것
	 * (같으면 앞선 것). 그런 플랜이 없으면 닿는 플랜 중 손실 비율이 가장 낮은 것. 닿는 플랜이 없으면 null.
	 */
	static String recommend(List<Scenario> scenarios) {
		Scenario best = null;
		for (Scenario s : scenarios) {
			if (s.reachable() && s.outcome().lossBp() <= RECOMMEND_LOSS_BP && (best == null || s.monthly() < best.monthly())) {
				best = s;
			}
		}
		if (best != null) {
			return best.id();
		}
		for (Scenario s : scenarios) {
			if (s.reachable() && (best == null || s.outcome().lossBp() < best.outcome().lossBp()
					|| (s.outcome().lossBp() == best.outcome().lossBp() && s.monthly() < best.monthly()))) {
				best = s;
			}
		}
		return best == null ? null : best.id();
	}

	private static List<String> assumptions(long initial, int months, boolean cmaSample) {
		List<String> out = new ArrayList<>(ASSUMPTIONS);
		if (initial > 0) {
			out.set(0, "처음 모은 돈 " + String.format("%,d", initial) + "원을 시작 금액으로 하고, 매달 초에 같은 금액을 비중대로 나눠 넣어요. 리밸런싱·중도 인출은 없어요.");
			out.add(INITIAL_ASSUMPTION);
		}
		if (!cmaSample) {
			out.set(1, CMA_REAL_ASSUMPTION);
		}
		if (months > ScenarioCash.FIRST_STAGE) {
			out.add(LONG_TERM_ASSUMPTION);
		}
		return out;
	}

	/**
	 * 제안기(AI) 결과를 검증해 쓰고, 쓸 수 없으면 데모 조합(§7-6).
	 * 순서: 키 없음(AI_UNAVAILABLE) → 비회원(GUEST) → 같은 회원의 같은 금액·기한·기준일 재사용(차감 없음) → 회원 횟수(LIMIT)·전체 상한(DAILY_CAP)
	 * → 호출 실패(AI_FAILED)·규칙 위반(AI_REJECTED). 결과를 못 받으면 회원 횟수는 되돌리고 전체 횟수는 그대로 둔다.
	 */
	private Chosen choose(long target, int years, int months, LocalDate asOf, Long userId, Picked picked) {
		ScenarioProposer p = proposer.getIfAvailable();
		String reason;
		if (p == null || !p.enabled()) {
			reason = "AI_UNAVAILABLE";
		}
		else if (userId == null) {
			reason = "GUEST";
		}
		else {
			ProposalText.Facts facts = facts(target, months, picked);
			Optional<List<Plan>> reused = quota.cached(userId, target, years, asOf).map(d -> Proposals.check(d, facts).plans());
			if (reused.isPresent()) {
				return new Chosen(reused.get(), null, usage(userId), true);
			}
			ScenarioAiQuota.Reserve r = quota.reserve(userId);
			if (r == ScenarioAiQuota.Reserve.GONE) {
				// 토큰은 유효하지만 회원이 없다(탈퇴). 다른 회원 API와 같이 401
				throw new ApiException(ErrorCode.UNAUTHORIZED);
			}
			if (r == ScenarioAiQuota.Reserve.OK) {
				try {
					List<Proposals.Draft> drafts = p.propose(new ScenarioProposer.Input(target, years, months, stats(picked)));
					Proposals.Checked checked = Proposals.check(drafts, facts);
					if (checked.plans() != null) {
						checked.removed().forEach(n -> log.warn("goal scenario AI sentence removed: {}", n.logLine(aiProps.logRejected())));
						quota.cache(userId, target, years, asOf, drafts, "openai");
						return new Chosen(checked.plans(), null, usage(userId), false);
					}
					// 어긴 규칙·위치만 남긴다. 옵션을 켜면 걸린 칸의 문구도 남긴다(목표 이름·회원 번호는 남기지 않음)
					log.warn("goal scenario AI rejected: {}", checked.logLine(aiProps.logRejected()));
					reason = "AI_REJECTED";
				}
				catch (ScenarioProposer.Failed e) {
					log.warn("goal scenario AI failed: {}", e.getMessage());
					reason = "AI_FAILED";
				}
				quota.refund(userId);
			}
			else {
				reason = r == ScenarioAiQuota.Reserve.DAILY_CAP ? "DAILY_CAP" : "LIMIT";
			}
		}
		return new Chosen(Proposals.validate(Proposals.DEMO).orElseThrow(() -> new IllegalStateException("데모 조합이 규칙에 맞지 않아요")), reason,
				userId == null ? null : usage(userId), false);
	}

	/** AI에게 보낸 사실(§7-6): 문구 속 숫자는 이 값과 같을 때만 허용한다. 상품 이름(함께 볼 상품 포함)·목표 금액·기한·적금·CMA 금리·세율 15.4%·통계. */
	private static ProposalText.Facts facts(long target, int months, Picked picked) {
		java.util.Set<String> names = new java.util.HashSet<>();
		names.add(picked.saving().name());
		names.add(picked.saving().company());
		picked.items().values().forEach(items -> items.forEach(i -> names.add(i.name())));
		picked.moreItems().values().forEach(items -> items.forEach(i -> names.add(i.name())));
		List<BigDecimal> percents = new ArrayList<>(List.of(picked.saving().baseRate(), picked.cmaRate(), new BigDecimal("15.4")));
		for (FixedCandidate more : picked.moreSavings()) {
			names.add(more.name());
			names.add(more.company());
			percents.add(more.baseRate());
		}
		names.remove(null);
		List<ScenarioProposer.TypeStat> sent = stats(picked);
		return new ProposalText.Facts(target, months, names, percents,
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
	private static List<ScenarioProposer.TypeStat> stats(Picked picked) {
		List<ScenarioProposer.TypeStat> out = new ArrayList<>();
		FixedCandidate s = picked.saving();
		out.add(new ScenarioProposer.TypeStat("SAVINGS", "은행 정액적립식 적금(" + s.company() + " " + s.name() + "), 금리 확정, 이자 15.4% 과세",
				rate(s), null, null, null, picked.moreSavings().stream()
					.map(m -> new ScenarioProposer.AltStat(m.name(), m.company(), rate(m), null, null, null)).toList()));
		out.add(new ScenarioProposer.TypeStat("CMA", picked.cmaSample() ? "수시 입출금 CMA, 예시 금리, 이자 15.4% 과세"
				: "수시 입출금 CMA, 수집한 공시 기본금리의 중간값, 이자 15.4% 과세", picked.cmaRate().toPlainString(), null, null, null, List.of()));
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
		int first = Math.min(months, ScenarioCash.FIRST_STAGE);
		List<FixedCandidate> fixed = savings.openFixed(first, CANDIDATES);
		if (fixed.isEmpty()) {
			throw new ApiException(ErrorCode.MARKET_UNAVAILABLE, "조건에 맞는 적금 공시가 아직 없어요", Map.of("field", "SAVINGS"));
		}
		FixedCandidate saving = fixed.getFirst();
		Map<String, BigDecimal[]> returns = new HashMap<>();
		List<InstrumentView> etfs = market.board(Board.ETF).items();
		List<InstrumentView> kr = withHistory(etfs.stream().filter(i -> i.name().strip().endsWith("200")).toList(), 1, CANDIDATES, last, returns,
				ProductType.KR_INDEX_ETF);
		List<InstrumentView> us = withHistory(etfs.stream().filter(i -> i.name().strip().endsWith("S&P500")).toList(), 1, CANDIDATES, last, returns,
				ProductType.US_INDEX_ETF);
		List<InstrumentView> kospi = withHistory(market.board(Board.KOSPI).items().stream().filter(i -> !preferred(i.name())).toList(), 5, 5, last,
				returns, ProductType.KOSPI_TOP5);
		Map<ProductType, List<Item>> items = new EnumMap<>(ProductType.class);
		items.put(ProductType.SAVINGS, List.of(new Item(saving.productId(), saving.name(), saving.company())));
		items.put(ProductType.CMA, List.of(new Item(null, "CMA", null)));
		items.put(ProductType.KR_INDEX_ETF, List.of(item(kr.getFirst())));
		items.put(ProductType.US_INDEX_ETF, List.of(item(us.getFirst())));
		items.put(ProductType.KOSPI_TOP5, kospi.stream().map(GoalScenarioService::item).toList());
		Map<ProductType, List<Item>> more = new EnumMap<>(ProductType.class);
		more.put(ProductType.KR_INDEX_ETF, kr.stream().skip(1).map(GoalScenarioService::item).toList());
		more.put(ProductType.US_INDEX_ETF, us.stream().skip(1).map(GoalScenarioService::item).toList());
		DepositService.FixedCandidate deposit = deposits.openFixed(first, 1).stream().findFirst().orElse(null);
		FixedCandidate saving2 = null;
		DepositService.FixedCandidate deposit2 = null;
		if (months > ScenarioCash.FIRST_STAGE) {
			int rest = months - ScenarioCash.FIRST_STAGE;
			saving2 = savings.openFixed(rest, 1).stream().findFirst().orElse(null);
			deposit2 = deposits.openFixed(rest, 1).stream().findFirst().orElse(null);
		}
		Optional<BigDecimal> cmaMedian = cashCatalog.cmaMedianRate();
		return new Picked(items, saving, returns, fixed.subList(1, fixed.size()), more, deposit, saving2, deposit2,
				cmaMedian.orElse(CMA_RATE), cmaMedian.isEmpty());
	}

	private static ScenarioCash cashModel(Picked p, int months, BigDecimal drop) {
		return new ScenarioCash(months, new ScenarioCash.Rate(p.saving().baseRate(), p.saving().compound()),
				p.deposit() == null ? null : new ScenarioCash.Rate(p.deposit().baseRate(), p.deposit().compound()),
				p.saving2() == null ? null : new ScenarioCash.Rate(p.saving2().baseRate(), p.saving2().compound()),
				p.deposit2() == null ? null : new ScenarioCash.Rate(p.deposit2().baseRate(), p.deposit2().compound()), p.cmaRate(), drop);
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

	/** 경로마다 years개 묶음 시작 위치(0~48). 모든 상품·시나리오가 같은 값을 쓴다. */
	static int[][] draws(int years) {
		SplittableRandom rnd = new SplittableRandom(SEED);
		int starts = HISTORY - BLOCK + 1;
		int[][] out = new int[PATHS][years];
		for (int p = 0; p < PATHS; p++) {
			for (int y = 0; y < years; y++) {
				out[p][y] = rnd.nextInt(starts);
			}
		}
		return out;
	}

	/** 경로마다 매달 1원을 넣었을 때의 기한 말 배수. */
	static BigDecimal[] factors(BigDecimal[] returns, int[][] draws) {
		BigDecimal[] out = new BigDecimal[draws.length];
		for (int p = 0; p < draws.length; p++) {
			BigDecimal[] path = new BigDecimal[draws[p].length * BLOCK];
			for (int y = 0; y < draws[p].length; y++) {
				System.arraycopy(returns, draws[p][y], path, y * BLOCK, BLOCK);
			}
			out[p] = ScenarioMath.factor(path);
		}
		return out;
	}

	/** 경로마다 처음 한 번 넣은 돈의 기한 말 배수. */
	static BigDecimal[] lumpFactors(BigDecimal[] returns, int[][] draws) {
		BigDecimal[] out = new BigDecimal[draws.length];
		for (int p = 0; p < draws.length; p++) {
			BigDecimal[] path = new BigDecimal[draws[p].length * BLOCK];
			for (int y = 0; y < draws[p].length; y++) {
				System.arraycopy(returns, draws[p][y], path, y * BLOCK, BLOCK);
			}
			out[p] = ScenarioMath.lumpFactor(path);
		}
		return out;
	}

	/** 처음 모은 돈의 나눔: 투자 상품 하나에 들어가는 금액(유형별)과 저축 몫(투자 몫을 뺀 나머지, 반올림 나머지 포함). */
	record Split(Map<ProductType, Long> each, long saving) {
	}

	static Split splitInitial(long initial, Map<ProductType, Integer> mix, Map<ProductType, Integer> counts) {
		Map<ProductType, Long> each = new EnumMap<>(ProductType.class);
		long invested = 0;
		for (ProductType t : INVEST) {
			int ratio = mix.getOrDefault(t, 0);
			if (initial > 0 && ratio > 0) {
				int k = counts.get(t);
				long one = initial * ratio / 100 / k;
				if (one > 0) {
					each.put(t, one);
					invested += one * k;
				}
			}
		}
		return new Split(each, initial - invested);
	}

	/** 처음 돈이 없고 적금·CMA만 현재 금리로 쓰는 단순한 경우(정책 예시·테스트). */
	static LongFunction<long[]> finals(Map<ProductType, Integer> mix, int months, int n, BigDecimal savingsRate, boolean savingsCompound,
			Map<ProductType, List<BigDecimal[]>> itemFactors) {
		return finals(mix, months, n, ScenarioCash.simple(months, savingsRate, savingsCompound, CMA_RATE), 0, itemFactors, Map.of());
	}

	/**
	 * 월 금액 → 경로별 기한 말 금액. 적금·CMA·처음 돈의 저축 몫은 모든 경로에서 같고, 투자 유형은 경로 배수를 곱한다.
	 * itemFactors는 유형마다 상품별 매달 넣을 때의 경로 배수, lumpFactors는 처음 돈을 넣을 때의 경로 배수(KOSPI_TOP5는 5개).
	 */
	static LongFunction<long[]> finals(Map<ProductType, Integer> mix, int months, int n, ScenarioCash cash, long initial,
			Map<ProductType, List<BigDecimal[]>> itemFactors, Map<ProductType, List<BigDecimal[]>> lumpFactors) {
		Map<ProductType, Integer> counts = new EnumMap<>(ProductType.class);
		itemFactors.forEach((t, fs) -> counts.put(t, fs.size()));
		Split split = splitInitial(initial, mix, counts);
		long[] lump = new long[n];
		Arrays.fill(lump, cash.lump(split.saving()).finalAmount());
		split.each().forEach((t, one) -> {
			for (BigDecimal[] f : lumpFactors.get(t)) {
				for (int p = 0; p < n; p++) {
					lump[p] += ScenarioMath.lumpInvest(one, f[p], t == ProductType.US_INDEX_ETF).finalAmount();
				}
			}
		});
		return monthly -> {
			Map<ProductType, Long> alloc = ScenarioMath.allocate(monthly, mix);
			long fixed = 0;
			if (alloc.containsKey(ProductType.SAVINGS)) {
				fixed += cash.savings(alloc.get(ProductType.SAVINGS));
			}
			if (alloc.containsKey(ProductType.CMA)) {
				fixed += cash.cma(alloc.get(ProductType.CMA));
			}
			long[] out = lump.clone();
			for (int p = 0; p < n; p++) {
				out[p] += fixed;
			}
			for (ProductType t : INVEST) {
				Long amount = alloc.get(t);
				if (amount == null) {
					continue;
				}
				List<BigDecimal[]> fs = itemFactors.get(t);
				long each = amount / fs.size();
				for (BigDecimal[] f : fs) {
					for (int p = 0; p < n; p++) {
						out[p] += ScenarioMath.invest(each, months, f[p], t == ProductType.US_INDEX_ETF).finalAmount();
					}
				}
			}
			return out;
		};
	}

	/** 계산 결과 하나. reachable=false면 monthly·outcome이 없다. */
	record Computed(long monthly, long paid, long[] values, Outcome outcome) {
	}

	/** 필요 월 금액과 그 금액에서의 결과(§7-5). n은 경로 수(투자가 없으면 1). 닿지 못하면 null. */
	static Computed compute(long target, int months, int n, boolean invest, LongFunction<long[]> finals) {
		return compute(target, months, 0, n, invest, finals);
	}

	/** initial은 처음 모은 돈(넣은 돈에 더한다). 처음 돈만으로 닿으면 월 금액이 0원이다. */
	static Computed compute(long target, int months, long initial, int n, boolean invest, LongFunction<long[]> finals) {
		long monthly = ScenarioMath.requiredMonthly(target, ScenarioMath.needed(n, REACH_BP), finals);
		if (monthly < 0) {
			return null;
		}
		long paid = monthly * months + initial;
		long[] values = finals.apply(monthly);
		int chance = ScenarioMath.bp(ScenarioMath.reached(values, target), n);
		int loss = ScenarioMath.bp((int) Arrays.stream(values).filter(v -> v < paid).count(), n);
		if (!invest) {
			return new Computed(monthly, paid, values, new Outcome("FIXED", values[0], null, null, null, chance, loss));
		}
		long[] sorted = values.clone();
		Arrays.sort(sorted);
		return new Computed(monthly, paid, values, new Outcome("RANGE", null, sorted[ScenarioMath.quantileIndex(n, 1000)],
				sorted[ScenarioMath.quantileIndex(n, 5000)], sorted[ScenarioMath.quantileIndex(n, 9000)], chance, loss));
	}

	private Scenario scenario(Plan plan, String style, long target, int months, long initial, Picked picked, Map<String, BigDecimal[]> factors,
			Map<String, BigDecimal[]> lumpFactors, ScenarioCash cash, ScenarioCash down) {
		boolean invest = plan.mix().keySet().stream().anyMatch(ProductType::invest);
		int n = invest ? PATHS : 1;
		Map<ProductType, List<BigDecimal[]>> itemFactors = new EnumMap<>(ProductType.class);
		Map<ProductType, List<BigDecimal[]>> itemLumps = new EnumMap<>(ProductType.class);
		for (ProductType t : INVEST) {
			itemFactors.put(t, picked.items().get(t).stream().map(i -> factors.get(i.code())).toList());
			itemLumps.put(t, picked.items().get(t).stream().map(i -> lumpFactors.get(i.code())).toList());
		}
		Computed c = compute(target, months, initial, n, invest, finals(plan.mix(), months, n, cash, initial, itemFactors, itemLumps));
		Map<ProductType, Integer> counts = new EnumMap<>(ProductType.class);
		itemFactors.forEach((t, fs) -> counts.put(t, fs.size()));
		long savingShare = splitInitial(initial, plan.mix(), counts).saving();
		InitialSaving initialSaving = initial > 0 && savingShare > 0
				? new InitialSaving(savingShare, cash.lump(savingShare).place().name())
				: null;
		RateDown rateDown = null;
		if (down != null) {
			Computed cd = compute(target, months, initial, n, invest, finals(plan.mix(), months, n, down, initial, itemFactors, itemLumps));
			rateDown = new RateDown(cd != null, cd == null ? null : cd.monthly());
		}
		if (c == null) {
			List<MixItem> mix = plan.mix().entrySet().stream().map(e -> new MixItem(e.getKey(), e.getValue(), null)).toList();
			return new Scenario(plan.id(), plan.title(), plan.summary(), plan.explanation(), mix, false, null, null, null, style, false,
					initialSaving, rateDown);
		}
		Map<ProductType, Long> alloc = ScenarioMath.allocate(c.monthly(), plan.mix());
		List<MixItem> mix = plan.mix().entrySet().stream().map(e -> new MixItem(e.getKey(), e.getValue(), alloc.get(e.getKey()))).toList();
		return new Scenario(plan.id(), plan.title(), plan.summary(), plan.explanation(), mix, true, c.monthly(), c.paid(), c.outcome(), style,
				c.monthly() == 0, initialSaving, rateDown);
	}

	private static List<Product> products(Picked picked) {
		List<Product> out = new ArrayList<>();
		for (ProductType t : ProductType.values()) {
			String rate = switch (t) {
				case SAVINGS -> rate(picked.saving());
				case CMA -> picked.cmaRate().toPlainString();
				default -> null;
			};
			List<Alternative> more = t == ProductType.SAVINGS
					? picked.moreSavings().stream().map(m -> new Alternative(m.productId(), m.name(), m.company(), rate(m))).toList()
					: picked.moreItems().getOrDefault(t, List.of()).stream().map(i -> new Alternative(i.code(), i.name(), null, null)).toList();
			out.add(new Product(t, picked.items().get(t), rate, t == ProductType.CMA && picked.cmaSample(), more));
		}
		return out;
	}
}
