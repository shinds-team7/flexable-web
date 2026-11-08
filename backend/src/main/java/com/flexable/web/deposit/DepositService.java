package com.flexable.web.deposit;

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
import com.flexable.web.deposit.DepositDtos.Product;
import com.flexable.web.deposit.DepositDtos.ProductDetail;
import com.flexable.web.deposit.DepositDtos.ProductList;
import com.flexable.web.deposit.DepositDtos.Result;
import com.flexable.web.deposit.DepositDtos.SimulateRequest;
import com.flexable.web.deposit.DepositDtos.Simulation;

/** 로컬 DB에 저장된 정기예금 공시를 조회하고, 같은 조건으로 만기 금액을 계산한다(ADR-3: 계산은 서버). */
@Service
public class DepositService {

	static final String NOTICE = "공시 금리로 계산한 추정이에요. 은행 계산과 조금 다를 수 있고 우대조건은 직접 확인해야 해요.";
	private static final String DISCLOSURE_URL = "https://finlife.fss.or.kr";
	private static final ZoneId KST = ZoneId.of("Asia/Seoul");

	private final DepositProductRepository products;
	private final DepositRateOptionRepository options;
	private final Clock clock;

	DepositService(DepositProductRepository products, DepositRateOptionRepository options, Clock clock) {
		this.products = products;
		this.options = options;
		this.clock = clock;
	}

	/** 상품과 고른 금리 한 줄. */
	private record Pick(DepositProduct product, DepositRateOption option) {
		BigDecimal base() {
			return option.getIntrRate();
		}

		BigDecimal max() {
			BigDecimal m = option.getIntrRate2();
			return m == null || m.compareTo(base()) < 0 ? base() : m;
		}

		boolean compound() {
			return option.getIntrRateType().equals("M");
		}
	}

	@Transactional(readOnly = true)
	ProductList list(long amount, int termMonths, String sort, String direction, String interestType,
			List<String> sectors, List<String> companies, int page, int size) {
		validateAmount(amount, termMonths);
		if (page < 1 || size < 1 || size > 10000) {
			throw ApiException.invalid("page", "쪽 번호나 크기를 확인해 주세요");
		}
		String type = typeCode(interestType);
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

		Map<Long, List<DepositRateOption>> byProduct = new HashMap<>();
		for (DepositRateOption o : options.findBySaveTrm(termMonths)) {
			if (type == null || o.getIntrRateType().equals(type)) {
				byProduct.computeIfAbsent(o.getProductId(), k -> new ArrayList<>()).add(o);
			}
		}
		List<Pick> picks = new ArrayList<>();
		int noRate = 0;
		for (DepositProduct p : products.findAllById(byProduct.keySet())) {
			if (!sectors.contains(p.getSector()) || (!companies.isEmpty() && !companies.contains(p.getKorCoNm()))) {
				continue;
			}
			Optional<DepositRateOption> best = best(byProduct.get(p.getId()));
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

		List<Product> all = picks.stream().map(x -> toProduct(x, amount, termMonths)).toList();
		int from = (int) Math.min((long) (page - 1) * size, all.size());
		List<Product> items = all.subList(from, Math.min(from + size, all.size()));
		Long min = all.stream().map(x -> x.result().interestAfterTax()).min(Long::compare).orElse(null);
		Long max = all.stream().map(x -> x.result().interestAfterTax()).max(Long::compare).orElse(null);
		String month = picks.stream().map(x -> x.product().getDclsMonth()).max(String::compareTo).orElse(null);
		Instant fetched = picks.stream().map(x -> x.product().getFetchedAt()).max(Instant::compareTo).orElse(clock.instant());
		return new ProductList(items, all.size(), page, size, min, max, noRate, month == null ? "" : formatMonth(month), asOf(fetched), NOTICE, false);
	}

	/** 공시가 있는 금융회사 목록(가나다순). 화면의 은행 선택지. */
	@Transactional(readOnly = true)
	List<DepositDtos.Company> companies() {
		return products.findAll()
			.stream()
			.map(p -> new DepositDtos.Company(p.getKorCoNm(), p.getSector()))
			.distinct()
			.sorted(Comparator.comparing(DepositDtos.Company::name))
			.toList();
	}

	@Transactional(readOnly = true)
	ProductDetail detail(String id, int termMonths, String interestType) {
		Pick pick = find(id, termMonths, typeCode(interestType));
		DepositProduct p = pick.product();
		return new ProductDetail(String.valueOf(p.getId()), p.getKorCoNm(), p.getFinPrdtNm(), p.getSector(), pick.base(),
				pick.max(), termMonths, interestType(pick.option()), formatMonth(p.getDclsMonth()), p.getMaxLimit(),
				orDash(p.getJoinMember(), "제한 없음"), joinDeny(p.getJoinDeny()), openToAll(p), DISCLOSURE_URL,
				asOf(p.getFetchedAt()), orDash(p.getSpclCnd(), "우대조건 없음"));
	}

	@Transactional(readOnly = true)
	Simulation simulate(SimulateRequest req) {
		validateAmount(req.amount(), req.termMonths());
		if (!req.rateBasis().equals("BASE") && !req.rateBasis().equals("MAX")) {
			throw ApiException.invalid("rateBasis", "금리 기준을 확인해 주세요");
		}
		Pick pick = find(req.productId(), req.termMonths(), typeCode(req.interestType()));
		BigDecimal rate = req.rateBasis().equals("MAX") ? pick.max() : pick.base();
		Long limit = pick.product().getMaxLimit();
		DepositCalculator.Result r = DepositCalculator.calculate(req.amount(), limit, req.termMonths(), rate, pick.compound());
		List<String> assumptions = new ArrayList<>();
		assumptions.add((pick.compound() ? "월복리" : "단리") + ", 이자를 원 단위로 내림");
		assumptions.add("세금은 이자의 15.4%로 단순 계산(내림)");
		assumptions.add("우대조건은 계산에 넣지 않아요");
		if (req.rateBasis().equals("MAX")) {
			assumptions.add("최고금리는 우대조건을 모두 채운 경우예요");
		}
		long principal = DepositCalculator.deposit(req.amount(), limit);
		long[] accrued = DepositCalculator.accruedByMonth(req.amount(), limit, req.termMonths(), rate, pick.compound());
		List<DepositDtos.Point> series = new ArrayList<>();
		for (int m = 1; m <= req.termMonths(); m++) {
			series.add(new DepositDtos.Point(m, principal, accrued[m - 1]));
		}
		return new Simulation(r.principal(), r.interestPreTax(), r.tax(), r.interestAfterTax(), r.maturityAmount(),
				r.excludedAmount(), req.rateBasis(), series, assumptions, NOTICE, false);
	}

	/** type이 null이면 그 기간의 모든 이자 방식 중 가장 높은 기본금리 줄을 고른다. */
	private Pick find(String id, int termMonths, String type) {
		long productId;
		try {
			productId = Long.parseLong(id);
		}
		catch (NumberFormatException e) {
			throw notFound();
		}
		DepositProduct p = products.findById(productId).orElseThrow(DepositService::notFound);
		List<DepositRateOption> matching = options.findByProductId(productId)
			.stream()
			.filter(o -> o.getSaveTrm() == termMonths && (type == null || o.getIntrRateType().equals(type)))
			.toList();
		DepositRateOption o = best(matching).orElseThrow(DepositService::notFound);
		return new Pick(p, o);
	}

	/** 기본금리가 있는 줄 중 가장 높은 것. */
	private static Optional<DepositRateOption> best(List<DepositRateOption> candidates) {
		return candidates.stream()
			.filter(o -> o.getIntrRate() != null)
			.max(Comparator.comparing(DepositRateOption::getIntrRate));
	}

	private Product toProduct(Pick x, long amount, int termMonths) {
		DepositProduct p = x.product();
		DepositCalculator.Result r = DepositCalculator.calculate(amount, p.getMaxLimit(), termMonths, x.base(), x.compound());
		return new Product(String.valueOf(p.getId()), p.getKorCoNm(), p.getFinPrdtNm(), p.getSector(), x.base(), x.max(),
				termMonths, interestType(x.option()), formatMonth(p.getDclsMonth()), p.getMaxLimit(),
				orDash(p.getJoinMember(), "제한 없음"), joinDeny(p.getJoinDeny()), openToAll(p), DISCLOSURE_URL,
				asOf(p.getFetchedAt()), new Result(r.principal(), r.interestPreTax(), r.tax(), r.interestAfterTax(),
						r.maturityAmount(), r.excludedAmount(), "BASE"));
	}

	private static void validateAmount(long amount, int termMonths) {
		if (amount < 1) {
			throw ApiException.invalid("amount", "맡길 돈을 확인해 주세요");
		}
		if (termMonths < 1 || termMonths > 120) {
			throw ApiException.invalid("termMonths", "기간을 확인해 주세요");
		}
	}

	/** 이자 방식 이름 → 공시 코드(S 단리, M 복리). null·빈 값은 가리지 않는다. */
	private static String typeCode(String interestType) {
		if (interestType == null || interestType.isBlank()) {
			return null;
		}
		return switch (interestType) {
			case "SIMPLE" -> "S";
			case "COMPOUND" -> "M";
			default -> throw ApiException.invalid("interestType", "이자 방식을 확인해 주세요");
		};
	}

	private static String interestType(DepositRateOption o) {
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

	private static Boolean openToAll(DepositProduct p) {
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
