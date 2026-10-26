package com.flexable.web.savings;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 적금 공시를 DB에 반영하는 유일한 출입구. 수집 작업(ingest)이 부른다.
 * 받아 온 목록이 전체 스냅숏이라는 전제로, 같은 키는 갱신하고 목록에 없는 상품은 지운다.
 */
@Service
public class SavingsCatalogService {

	/** 공시 상품 한 개. sector는 BANK 또는 SAVINGS_BANK. */
	public record ProductData(String finCoNo, String finPrdtCd, String sector, String dclsMonth, String korCoNm,
			String finPrdtNm, String joinWay, String mtrtInt, String spclCnd, String joinDeny, String joinMember,
			String etcNote, Long maxLimit, String dclsStrtDay, String dclsEndDay, String finCoSubmDay,
			List<OptionData> options) {
	}

	public record OptionData(String intrRateType, String rsrvType, int saveTrm, BigDecimal intrRate,
			BigDecimal intrRate2) {
	}

	/** 청년정책 한 개(온통청년). 빈 문자열은 null로 정리해 넘긴다. */
	public record PolicyData(String plcyNo, String plcyNm, String plcyExplnCn, String plcySprtCn, String lclsfNm,
			String mclsfNm, String sprvsnInstNm, String operInstNm, String aplyYmd, String bizPrdBgngYmd,
			String bizPrdEndYmd, String bizPrdEtcCn, String plcyAplyMthdCn, String srngMthdCn, String sbmsnDcmntCn,
			String aplyUrlAddr, String refUrlAddr, String etcMttrCn, Integer sprtTrgtMinAge, Integer sprtTrgtMaxAge,
			String earnEtcCn, String addAplyQlfcCndCn, String ptcpPrpTrgtCn, String lastMdfcnDt, String region) {
	}

	private final SavingsProductRepository products;
	private final SavingsRateOptionRepository options;
	private final SavingsPolicyRepository policies;
	private final Clock clock;

	SavingsCatalogService(SavingsProductRepository products, SavingsRateOptionRepository options,
			SavingsPolicyRepository policies, Clock clock) {
		this.products = products;
		this.options = options;
		this.policies = policies;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public long policyCount() {
		return policies.count();
	}

	/** 정책 전체 스냅숏 교체(같은 정책번호는 갱신, 목록에 없는 정책은 삭제). 빈 목록은 받아들이지 않는다. */
	@Transactional
	public int replacePolicies(List<PolicyData> snapshot) {
		if (snapshot.isEmpty()) {
			throw new IllegalArgumentException("빈 정책 목록으로 교체할 수 없습니다");
		}
		Instant now = clock.instant();
		Set<Long> keep = new HashSet<>();
		Set<String> seen = new HashSet<>();
		for (PolicyData d : snapshot) {
			if (!seen.add(d.plcyNo())) {
				continue;
			}
			SavingsPolicy p = policies.findByPlcyNo(d.plcyNo()).orElseGet(() -> new SavingsPolicy(d.plcyNo()));
			p.apply(d, now);
			keep.add(policies.save(p).getId());
		}
		List<Long> stale = policies.findAll().stream().map(SavingsPolicy::getId).filter(id -> !keep.contains(id)).toList();
		if (!stale.isEmpty()) {
			policies.deleteAllById(stale);
		}
		return keep.size();
	}

	@Transactional(readOnly = true)
	public long count() {
		return products.count();
	}

	/** 반영한 상품 수를 돌려준다. 빈 목록은 받아들이지 않는다(수집 실패로 기존 데이터를 지우지 않기 위해). */
	@Transactional
	public int replaceAll(List<ProductData> snapshot) {
		if (snapshot.isEmpty()) {
			throw new IllegalArgumentException("빈 적금 목록으로 교체할 수 없습니다");
		}
		Instant now = clock.instant();
		Set<Long> keep = new HashSet<>();
		for (ProductData d : snapshot) {
			SavingsProduct p = products.findByFinCoNoAndFinPrdtCd(d.finCoNo(), d.finPrdtCd())
				.orElseGet(() -> new SavingsProduct(d.finCoNo(), d.finPrdtCd()));
			boolean isNew = p.getId() == null;
			p.apply(d, now);
			p = products.saveAndFlush(p);
			if (!isNew) {
				options.deleteByProductId(p.getId());
			}
			Set<String> seen = new HashSet<>();
			for (OptionData o : d.options()) {
				// 같은 (금리 유형, 적립 유형, 기간)이 두 번 오면 첫 값만 둔다(유니크 키)
				if (seen.add(o.intrRateType() + o.rsrvType() + o.saveTrm())) {
					options.save(new SavingsRateOption(p.getId(), o.intrRateType(), o.rsrvType(), o.saveTrm(),
							o.intrRate(), o.intrRate2()));
				}
			}
			keep.add(p.getId());
		}
		List<Long> stale = products.findAll().stream().map(SavingsProduct::getId).filter(id -> !keep.contains(id)).toList();
		if (!stale.isEmpty()) {
			options.deleteByProductIdIn(stale);
			products.deleteAllById(stale);
		}
		return snapshot.size();
	}
}
