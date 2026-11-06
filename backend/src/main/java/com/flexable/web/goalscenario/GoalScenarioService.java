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
import com.flexable.web.goalscenario.GoalScenarioDtos.Item;
import com.flexable.web.goalscenario.GoalScenarioDtos.MixItem;
import com.flexable.web.goalscenario.GoalScenarioDtos.Outcome;
import com.flexable.web.goalscenario.GoalScenarioDtos.Product;
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
	static final BigDecimal CMA_RATE = new BigDecimal("2.50");
	static final String NOTICE = "이 결과는 입력한 조건과 과거 자료·계산 모형을 바탕으로 AI와 계산 서버가 만든 추정 시나리오예요. "
			+ "실제 수익과 목표 달성 여부를 보장하지 않으며, 투자한 원금의 일부 또는 전부를 잃을 수 있어요. 자료 기준일과 계산 가정을 함께 확인해 주세요.";
	static final List<String> ASSUMPTIONS = List.of(
			"시작 금액은 0원이고 매달 초에 같은 금액을 비중대로 나눠 넣어요. 리밸런싱·중도 인출은 없어요.",
			"적금은 개인이 가입할 수 있는 은행 상품 중 기본금리가 가장 높은 상품을 골라 기본금리(우대금리 제외)로, CMA는 예시 금리 연 2.5%로 계산했어요.",
			"이자와 미국 지수 ETF 이익에는 15.4% 세금을 뺐어요. 국내 지수 ETF·주식은 세금을 넣지 않았어요.",
			"배당·매매 수수료는 넣지 않았어요.",
			"지수 ETF·주식은 지난 60개월의 월 수익률을 12개월 묶음으로 무작위로 이어 붙인 2,000가지 경우로 계산했어요.",
			"코스피 주식은 시가총액 상위 5종목에 같은 금액으로 나눠 넣는다고 가정했어요.");
	private static final List<ProductType> INVEST = List.of(ProductType.KR_INDEX_ETF, ProductType.US_INDEX_ETF, ProductType.KOSPI_TOP5);

	private final MarketService market;
	private final SavingsService savings;
	private final ObjectProvider<ScenarioProposer> proposer;
	private final ScenarioResultCache results;
	private final ScenarioAiQuota quota;
	private final GoalScenarioAiProperties aiProps;

	GoalScenarioService(MarketService market, SavingsService savings, ObjectProvider<ScenarioProposer> proposer, ScenarioResultCache results,
			ScenarioAiQuota quota, GoalScenarioAiProperties aiProps) {
		this.aiProps = aiProps;
		this.market = market;
		this.savings = savings;
		this.proposer = proposer;
		this.results = results;
		this.quota = quota;
	}

	/** 유형마다 고른 상품(KOSPI_TOP5는 5개, CMA는 이름만)과 투자 상품의 60개월 월 수익률. */
	private record Picked(Map<ProductType, List<Item>> items, FixedCandidate saving, Map<String, BigDecimal[]> returns) {
	}

	/** 쓸 조합과, 데모로 바꿨다면 그 이유(AI면 null), 회원이면 남은 AI 횟수, 이전 AI 조합을 다시 썼는지. */
	private record Chosen(List<Plan> plans, String fallbackReason, GoalScenarioDtos.AiUsage aiUsage, boolean reused) {
	}

	/** userId는 로그인한 회원이면 웹 회원 번호, 비회원이면 null(데모 조합, GUEST). */
	Result calculate(Request req, Long userId) {
		String name = validate(req);
		long target = req.targetAmount();
		int years = req.years();
		int months = years * 12;

		// 기준일 = 수집된 마지막 거래일. 수익률은 그 직전 달까지 60개월
		LocalDate asOf = Optional.ofNullable(market.status().pricesAsOf()).orElseThrow(() -> unavailable(ProductType.KR_INDEX_ETF.name()));
		YearMonth last = YearMonth.from(asOf).minusMonths(1);
		Picked picked = pick(months, last);
		int[][] draws = draws(years);
		Map<String, BigDecimal[]> factors = new HashMap<>();
		picked.returns().forEach((code, r) -> factors.put(code, factors(r, draws)));

		Chosen chosen = choose(target, years, months, asOf, userId, picked);
		List<Scenario> scenarios = new ArrayList<>();
		for (Plan plan : chosen.plans()) {
			scenarios.add(scenario(plan, target, months, picked, factors));
		}
		Result result = new Result(null, name, target, years, months, chosen.fallbackReason() == null ? "AI" : "DEMO", chosen.fallbackReason(), asOf,
				last.minusMonths(HISTORY - 1).toString(), last.toString(), PATHS, SEED, new BigDecimal("0.8"),
				products(picked), scenarios, ASSUMPTIONS, NOTICE, true, chosen.aiUsage(), chosen.reused());
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
		if (req.years() == null || req.years() < 1 || req.years() > 3) {
			throw ApiException.invalid("years", "기한은 1년·2년·3년 중에서 골라 주세요");
		}
		return name;
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

	/** AI에게 보낸 사실(§7-6): 문구 속 숫자는 이 값과 같을 때만 허용한다. 상품 이름·목표 금액·기한·적금·CMA 금리·세율 15.4%·유형별 통계. */
	private static ProposalText.Facts facts(long target, int months, Picked picked) {
		java.util.Set<String> names = new java.util.HashSet<>();
		names.add(picked.saving().name());
		names.add(picked.saving().company());
		picked.items().values().forEach(items -> items.forEach(i -> names.add(i.name())));
		names.remove(null);
		List<ScenarioProposer.TypeStat> sent = stats(picked);
		return new ProposalText.Facts(target, months, names, List.of(picked.saving().baseRate(), CMA_RATE, new BigDecimal("15.4")),
				java.util.Map.of(ProposalText.StatKind.MEAN, statPercents(sent, ScenarioProposer.TypeStat::meanMonthlyReturn),
						ProposalText.StatKind.VOLATILITY, statPercents(sent, ScenarioProposer.TypeStat::monthlyVolatility),
						ProposalText.StatKind.DRAWDOWN, statPercents(sent, ScenarioProposer.TypeStat::maxDrawdown)));
	}

	/** 소수로 보낸 통계(0.05)를 문구와 대조할 %의 절댓값(5.00)으로 바꾼다. */
	private static List<BigDecimal> statPercents(List<ScenarioProposer.TypeStat> stats,
			java.util.function.Function<ScenarioProposer.TypeStat, String> field) {
		return stats.stream().map(field).filter(java.util.Objects::nonNull).map(v -> new BigDecimal(v).movePointRight(2).abs()).toList();
	}

	private GoalScenarioDtos.AiUsage usage(long userId) {
		return new GoalScenarioDtos.AiUsage(quota.limitPerDay(userId), quota.remaining(userId));
	}

	/** AI에게 보내는 유형별 사실(§7-6). 투자 유형은 지난 60개월 월 수익률의 평균·표준편차·최대 하락. 코스피 5종목은 같은 비중 평균. */
	private static List<ScenarioProposer.TypeStat> stats(Picked picked) {
		List<ScenarioProposer.TypeStat> out = new ArrayList<>();
		FixedCandidate s = picked.saving();
		out.add(new ScenarioProposer.TypeStat("SAVINGS", "은행 정액적립식 적금(" + s.company() + " " + s.name() + "), 금리 확정, 이자 15.4% 과세",
				s.baseRate().setScale(2, RoundingMode.HALF_UP).toPlainString(), null, null, null));
		out.add(new ScenarioProposer.TypeStat("CMA", "수시 입출금 CMA, 예시 금리, 이자 15.4% 과세", CMA_RATE.toPlainString(), null, null, null));
		for (ProductType t : INVEST) {
			List<BigDecimal[]> series = picked.items().get(t).stream().map(i -> picked.returns().get(i.code())).toList();
			BigDecimal[] avg = averageSeries(series);
			String name = picked.items().get(t).stream().map(Item::name).reduce((a, b) -> a + "·" + b).orElse("");
			String desc = switch (t) {
				case KR_INDEX_ETF -> "국내 대표 지수 ETF(" + name + "), 비과세";
				case US_INDEX_ETF -> "미국 대표 지수 ETF(" + name + ", 국내 상장, 원화), 이익에 15.4% 과세";
				default -> "코스피 시가총액 상위 다섯 종목(" + name + ")에 같은 금액, 비과세";
			};
			out.add(new ScenarioProposer.TypeStat(t.name(), desc, null, fmt(mean(avg)), fmt(stdev(avg)), fmt(maxDrawdown(avg))));
		}
		return out;
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
	 */
	private Picked pick(int months, YearMonth last) {
		FixedCandidate saving = savings.bestOpenFixed(months)
			.orElseThrow(() -> new ApiException(ErrorCode.MARKET_UNAVAILABLE, "조건에 맞는 적금 공시가 아직 없어요", Map.of("field", "SAVINGS")));
		Map<String, BigDecimal[]> returns = new HashMap<>();
		List<InstrumentView> etfs = market.board(Board.ETF).items();
		InstrumentView kr = withHistory(etfs.stream().filter(i -> i.name().strip().endsWith("200")).toList(), 1, last, returns,
				ProductType.KR_INDEX_ETF).getFirst();
		InstrumentView us = withHistory(etfs.stream().filter(i -> i.name().strip().endsWith("S&P500")).toList(), 1, last, returns,
				ProductType.US_INDEX_ETF).getFirst();
		List<InstrumentView> kospi = withHistory(market.board(Board.KOSPI).items().stream().filter(i -> !preferred(i.name())).toList(), 5, last,
				returns, ProductType.KOSPI_TOP5);
		Map<ProductType, List<Item>> items = new EnumMap<>(ProductType.class);
		items.put(ProductType.SAVINGS, List.of(new Item(saving.productId(), saving.name(), saving.company())));
		items.put(ProductType.CMA, List.of(new Item(null, "CMA", null)));
		items.put(ProductType.KR_INDEX_ETF, List.of(new Item(kr.id(), kr.name(), null)));
		items.put(ProductType.US_INDEX_ETF, List.of(new Item(us.id(), us.name(), null)));
		items.put(ProductType.KOSPI_TOP5, kospi.stream().map(i -> new Item(i.id(), i.name(), null)).toList());
		return new Picked(items, saving, returns);
	}

	/** 후보(시가총액 순) 중 수익률 자료가 모두 있는 앞의 count개. 고른 것의 수익률은 returns에 담는다. */
	private List<InstrumentView> withHistory(List<InstrumentView> candidates, int count, YearMonth last, Map<String, BigDecimal[]> returns,
			ProductType type) {
		List<InstrumentView> out = new ArrayList<>();
		for (InstrumentView i : candidates) {
			if (out.size() == count) {
				break;
			}
			Optional<BigDecimal[]> r = monthlyReturns(i.id(), last);
			if (r.isPresent()) {
				returns.put(i.id(), r.get());
				out.add(i);
			}
		}
		if (out.size() < count) {
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

	/**
	 * 월 금액 → 경로별 기한 말 금액. 적금·CMA는 모든 경로에서 같고, 투자 유형은 경로 배수를 곱한다.
	 * itemFactors는 유형마다 상품별 경로 배수(KOSPI_TOP5는 5개).
	 */
	static LongFunction<long[]> finals(Map<ProductType, Integer> mix, int months, int n, BigDecimal savingsRate, boolean savingsCompound,
			Map<ProductType, List<BigDecimal[]>> itemFactors) {
		return monthly -> {
			Map<ProductType, Long> alloc = ScenarioMath.allocate(monthly, mix);
			long fixed = 0;
			if (alloc.containsKey(ProductType.SAVINGS)) {
				fixed += SavingsService.maturity(alloc.get(ProductType.SAVINGS), months, savingsRate, savingsCompound).finalAmount();
			}
			if (alloc.containsKey(ProductType.CMA)) {
				fixed += ScenarioMath.cma(alloc.get(ProductType.CMA), months, CMA_RATE).finalAmount();
			}
			long[] out = new long[n];
			Arrays.fill(out, fixed);
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
		long monthly = ScenarioMath.requiredMonthly(target, ScenarioMath.needed(n, REACH_BP), finals);
		if (monthly < 0) {
			return null;
		}
		long paid = monthly * months;
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

	private Scenario scenario(Plan plan, long target, int months, Picked picked, Map<String, BigDecimal[]> factors) {
		boolean invest = plan.mix().keySet().stream().anyMatch(ProductType::invest);
		int n = invest ? PATHS : 1;
		Map<ProductType, List<BigDecimal[]>> itemFactors = new EnumMap<>(ProductType.class);
		for (ProductType t : INVEST) {
			itemFactors.put(t, picked.items().get(t).stream().map(i -> factors.get(i.code())).toList());
		}
		FixedCandidate s = picked.saving();
		Computed c = compute(target, months, n, invest, finals(plan.mix(), months, n, s.baseRate(), s.compound(), itemFactors));
		if (c == null) {
			List<MixItem> mix = plan.mix().entrySet().stream().map(e -> new MixItem(e.getKey(), e.getValue(), null)).toList();
			return new Scenario(plan.id(), plan.title(), plan.summary(), plan.explanation(), mix, false, null, null, null);
		}
		Map<ProductType, Long> alloc = ScenarioMath.allocate(c.monthly(), plan.mix());
		List<MixItem> mix = plan.mix().entrySet().stream().map(e -> new MixItem(e.getKey(), e.getValue(), alloc.get(e.getKey()))).toList();
		return new Scenario(plan.id(), plan.title(), plan.summary(), plan.explanation(), mix, true, c.monthly(), c.paid(), c.outcome());
	}

	private static List<Product> products(Picked picked) {
		List<Product> out = new ArrayList<>();
		for (ProductType t : ProductType.values()) {
			String rate = switch (t) {
				case SAVINGS -> picked.saving().baseRate().setScale(2, RoundingMode.HALF_UP).toPlainString();
				case CMA -> CMA_RATE.toPlainString();
				default -> null;
			};
			out.add(new Product(t, picked.items().get(t), rate, t == ProductType.CMA));
		}
		return out;
	}
}
