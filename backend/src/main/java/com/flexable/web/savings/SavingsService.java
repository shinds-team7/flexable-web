package com.flexable.web.savings;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.savings.SavingsDtos.Product;
import com.flexable.web.savings.SavingsDtos.ProductDetail;
import com.flexable.web.savings.SavingsDtos.ProductList;
import com.flexable.web.savings.SavingsDtos.Result;
import com.flexable.web.savings.SavingsDtos.SimulateRequest;
import com.flexable.web.savings.SavingsDtos.Simulation;

/** 로컬 DB에 저장된 적금 공시를 조회하고, 같은 조건으로 만기 금액을 계산한다(ADR-3: 계산은 서버). */
@Service
public class SavingsService {

	static final String NOTICE = "공시 금리로 계산한 추정이에요. 은행 계산과 조금 다를 수 있고 우대조건은 직접 확인해야 해요.";
	private static final String DISCLOSURE_URL = "https://finlife.fss.or.kr";
	private static final ZoneId KST = ZoneId.of("Asia/Seoul");

	private final SavingsProductRepository products;
	private final SavingsRateOptionRepository options;
	private final SavingsPolicyRepository policies;
	private final Clock clock;

	SavingsService(SavingsProductRepository products, SavingsRateOptionRepository options,
			SavingsPolicyRepository policies, Clock clock) {
		this.products = products;
		this.options = options;
		this.policies = policies;
		this.clock = clock;
	}

	/** 상품과 고른 금리 한 줄. */
	private record Pick(SavingsProduct product, SavingsRateOption option) {
		BigDecimal base() {
			return option.getIntrRate();
		}

		BigDecimal max() {
			BigDecimal m = option.getIntrRate2();
			return m == null || m.compareTo(base()) < 0 ? base() : m;
		}
	}

	@Transactional(readOnly = true)
	ProductList list(long monthly, int termMonths, String sort, String direction, String reserveType,
			List<String> sectors, List<String> companies, int page, int size) {
		validateAmount(monthly, termMonths);
		if (page < 1 || size < 1 || size > 10000) {
			throw ApiException.invalid("page", "쪽 번호나 크기를 확인해 주세요");
		}
		String rsrv = rsrvCode(reserveType);
		if (!List.of("BASE_RATE", "MAX_RATE", "TERM").contains(sort)) {
			throw ApiException.invalid("sort", "정렬 기준을 확인해 주세요");
		}
		if (!List.of("ASC", "DESC").contains(direction)) {
			throw ApiException.invalid("direction", "정렬 방향을 확인해 주세요");
		}
		for (String s : sectors) {
			if (!s.equals("BANK") && !s.equals("SAVINGS_BANK")) {
				throw ApiException.invalid("sectors", "금융권을 확인해 주세요");
			}
		}

		Map<Long, List<SavingsRateOption>> byProduct = new HashMap<>();
		for (SavingsRateOption o : options.findByRsrvTypeAndSaveTrm(rsrv, termMonths)) {
			byProduct.computeIfAbsent(o.getProductId(), k -> new ArrayList<>()).add(o);
		}
		List<Pick> picks = new ArrayList<>();
		int noRate = 0;
		for (SavingsProduct p : products.findAllById(byProduct.keySet())) {
			if (!sectors.contains(p.getSector()) || (!companies.isEmpty() && !companies.contains(p.getKorCoNm()))) {
				continue;
			}
			Optional<SavingsRateOption> best = best(byProduct.get(p.getId()));
			if (best.isPresent()) {
				picks.add(new Pick(p, best.get()));
			}
			else {
				noRate++;
			}
		}

		Comparator<Pick> byKey = switch (sort) {
			case "MAX_RATE" -> Comparator.comparing(Pick::max);
			default -> Comparator.comparing(Pick::base); // TERM은 목록의 기간이 모두 같아 기본금리로 정렬한다
		};
		if (direction.equals("DESC")) {
			byKey = byKey.reversed();
		}
		picks.sort(byKey.thenComparing(Comparator.comparing(Pick::base).reversed())
			.thenComparing(x -> x.product().getFinPrdtNm()));

		List<Product> all = picks.stream().map(x -> toProduct(x, monthly, termMonths, reserveType)).toList();
		int from = Math.min((page - 1) * size, all.size());
		List<Product> items = all.subList(from, Math.min(from + size, all.size()));
		Long min = all.stream().map(x -> x.result().interestAfterTax()).min(Long::compare).orElse(null);
		Long max = all.stream().map(x -> x.result().interestAfterTax()).max(Long::compare).orElse(null);
		String month = picks.stream().map(x -> x.product().getDclsMonth()).max(String::compareTo).orElse(null);
		Instant fetched = picks.stream().map(x -> x.product().getFetchedAt()).max(Instant::compareTo).orElse(clock.instant());
		return new ProductList(items, all.size(), page, size, min, max, noRate, month == null ? "" : formatMonth(month), asOf(fetched), NOTICE, false);
	}

	/** 공시가 있는 금융회사 목록(가나다순). 화면의 은행 선택지. */
	@Transactional(readOnly = true)
	List<SavingsDtos.Company> companies() {
		return products.findAll()
			.stream()
			.map(p -> new SavingsDtos.Company(p.getKorCoNm(), p.getSector()))
			.distinct()
			.sorted(Comparator.comparing(SavingsDtos.Company::name))
			.toList();
	}

	/** 청년정책 목록(이름순). ids가 있으면 그 정책번호만. */
	@Transactional(readOnly = true)
	List<SavingsDtos.Policy> policies(List<String> ids) {
		return policies.findAll()
			.stream()
			.filter(p -> ids.isEmpty() || ids.contains(p.getPlcyNo()))
			.sorted(Comparator.comparing(SavingsPolicy::getPlcyNm).thenComparing(SavingsPolicy::getSprvsnInstNm,
					Comparator.nullsLast(Comparator.naturalOrder())))
			.map(SavingsService::toPolicy)
			.toList();
	}

	private static SavingsDtos.Policy toPolicy(SavingsPolicy p) {
		return new SavingsDtos.Policy(p.getPlcyNo(), p.getPlcyNm(), blank(p.getPlcyExplnCn()), blank(p.getPlcySprtCn()),
				blank(p.getMclsfNm()), blank(p.getSprvsnInstNm()), blank(p.getOperInstNm()), blank(p.getAplyYmd()),
				bizPeriod(p), zeroToNull(p.getSprtTrgtMinAge()), zeroToNull(p.getSprtTrgtMaxAge()),
				blank(p.getPlcyAplyMthdCn()), blank(p.getSrngMthdCn()), blank(p.getSbmsnDcmntCn()),
				blank(p.getAplyUrlAddr()), blank(p.getRefUrlAddr()), blank(p.getEtcMttrCn()), blank(p.getEarnEtcCn()),
				blank(p.getAddAplyQlfcCndCn()), blank(p.getPtcpPrpTrgtCn()), p.getRegion(), asOf(p.getFetchedAt()));
	}

	private static String blank(String s) {
		return s == null || s.isBlank() ? null : s.strip();
	}

	private static Integer zeroToNull(Integer n) {
		return n == null || n <= 0 ? null : n;
	}

	private static String bizPeriod(SavingsPolicy p) {
		String from = blank(p.getBizPrdBgngYmd());
		String to = blank(p.getBizPrdEndYmd());
		if (from != null || to != null) {
			return (from == null ? "" : from) + " ~ " + (to == null ? "" : to);
		}
		return blank(p.getBizPrdEtcCn());
	}

	@Transactional(readOnly = true)
	ProductDetail detail(String id, int termMonths, String reserveType) {
		Pick pick = find(id, termMonths, reserveType);
		SavingsProduct p = pick.product();
		return new ProductDetail(String.valueOf(p.getId()), p.getKorCoNm(), p.getFinPrdtNm(), p.getSector(), pick.base(),
				pick.max(), termMonths, reserveType, interestType(pick.option()), formatMonth(p.getDclsMonth()),
				p.getMaxLimit(), orDash(p.getJoinMember(), "제한 없음"), joinDeny(p.getJoinDeny()), openToAll(p),
				DISCLOSURE_URL, asOf(p.getFetchedAt()), orDash(p.getSpclCnd(), "우대조건 없음"));
	}

	@Transactional(readOnly = true)
	Simulation simulate(SimulateRequest req) {
		validateAmount(req.monthly(), req.termMonths());
		if (!req.rateBasis().equals("BASE") && !req.rateBasis().equals("MAX")) {
			throw ApiException.invalid("rateBasis", "금리 기준을 확인해 주세요");
		}
		Pick pick = find(req.productId(), req.termMonths(), req.reserveType());
		BigDecimal rate = req.rateBasis().equals("MAX") ? pick.max() : pick.base();
		boolean compound = pick.option().getIntrRateType().equals("M");
		SavingsCalculator.Result r = SavingsCalculator.calculate(req.monthly(), pick.product().getMaxLimit(),
				req.termMonths(), rate, compound);
		List<String> assumptions = new ArrayList<>();
		assumptions.add((req.reserveType().equals("FIXED") ? "정액적립식 " : "자유적립식(매달 같은 금액 가정) ")
				+ (compound ? "월복리" : "단리") + ", 회차마다 이자를 원 단위로 내림");
		assumptions.add("세금은 이자의 15.4%로 단순 계산(내림)");
		assumptions.add("우대조건은 계산에 넣지 않아요");
		if (req.rateBasis().equals("MAX")) {
			assumptions.add("최고금리는 우대조건을 모두 채운 경우예요");
		}
		return new Simulation(r.principal(), r.interestPreTax(), r.tax(), r.interestAfterTax(), r.maturityAmount(),
				r.excludedAmount(), req.rateBasis(), assumptions, NOTICE, false);
	}

	private Pick find(String id, int termMonths, String reserveType) {
		String rsrv = rsrvCode(reserveType);
		long productId;
		try {
			productId = Long.parseLong(id);
		}
		catch (NumberFormatException e) {
			throw notFound();
		}
		SavingsProduct p = products.findById(productId).orElseThrow(SavingsService::notFound);
		List<SavingsRateOption> matching = options.findByProductId(productId)
			.stream()
			.filter(o -> o.getRsrvType().equals(rsrv) && o.getSaveTrm() == termMonths)
			.toList();
		SavingsRateOption o = best(matching).orElseThrow(SavingsService::notFound);
		return new Pick(p, o);
	}

	/** 기본금리가 있는 줄 중 가장 높은 것. */
	private static Optional<SavingsRateOption> best(List<SavingsRateOption> candidates) {
		return candidates.stream()
			.filter(o -> o.getIntrRate() != null)
			.max(Comparator.comparing(SavingsRateOption::getIntrRate));
	}

	private Product toProduct(Pick x, long monthly, int termMonths, String reserveType) {
		SavingsProduct p = x.product();
		boolean compound = x.option().getIntrRateType().equals("M");
		SavingsCalculator.Result r = SavingsCalculator.calculate(monthly, p.getMaxLimit(), termMonths, x.base(), compound);
		return new Product(String.valueOf(p.getId()), p.getKorCoNm(), p.getFinPrdtNm(), p.getSector(), x.base(), x.max(),
				termMonths, reserveType, interestType(x.option()), formatMonth(p.getDclsMonth()), p.getMaxLimit(),
				orDash(p.getJoinMember(), "제한 없음"), joinDeny(p.getJoinDeny()), openToAll(p), DISCLOSURE_URL,
				asOf(p.getFetchedAt()), new Result(r.principal(), r.interestPreTax(), r.tax(), r.interestAfterTax(),
						r.maturityAmount(), r.excludedAmount(), "BASE"));
	}

	private static void validateAmount(long monthly, int termMonths) {
		if (monthly < 1) {
			throw ApiException.invalid("monthly", "매달 넣을 돈을 확인해 주세요");
		}
		if (termMonths < 1 || termMonths > 120) {
			throw ApiException.invalid("termMonths", "기간을 확인해 주세요");
		}
	}

	private static String rsrvCode(String reserveType) {
		return switch (reserveType) {
			case "FIXED" -> "S";
			case "FREE" -> "F";
			default -> throw ApiException.invalid("reserveType", "적립 방식을 확인해 주세요");
		};
	}

	private static String interestType(SavingsRateOption o) {
		return o.getIntrRateType().equals("M") ? "COMPOUND" : "SIMPLE";
	}

	private static String joinDeny(String code) {
		if (code == null) {
			return "확인 필요";
		}
		return switch (code) {
			case "1" -> "제한 없음";
			case "2" -> "서민 전용";
			case "3" -> "일부 제한";
			default -> "확인 필요";
		};
	}

	private static Boolean openToAll(SavingsProduct p) {
		return p.getJoinDeny() == null ? null : p.getJoinDeny().equals("1");
	}

	private static String orDash(String s, String fallback) {
		return s == null || s.isBlank() ? fallback : s.strip();
	}

	/** 공시 월 YYYYMM → YYYY-MM */
	private static String formatMonth(String yyyymm) {
		return yyyymm.length() == 6 ? yyyymm.substring(0, 4) + "-" + yyyymm.substring(4) : yyyymm;
	}

	private static String asOf(Instant at) {
		return LocalDate.ofInstant(at, KST).toString();
	}

	private static ApiException notFound() {
		return new ApiException(ErrorCode.NOT_FOUND, "상품을 찾지 못했어요");
	}
}
