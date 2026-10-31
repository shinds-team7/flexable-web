package com.flexable.web.deposit;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.util.HashSet;
import java.util.List;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

/**
 * 정기예금 공시를 DB에 반영하는 유일한 출입구. 수집 작업(ingest)이 부른다.
 * 받아 온 목록이 전체 스냅숏이라는 전제로, 같은 키는 갱신하고 목록에 없는 상품은 지운다.
 */
@Service
public class DepositCatalogService {

	/** 공시 상품 한 개. sector는 BANK 또는 SAVINGS_BANK. */
	public record ProductData(String finCoNo, String finPrdtCd, String sector, String dclsMonth, String korCoNm,
			String finPrdtNm, String joinWay, String mtrtInt, String spclCnd, String joinDeny, String joinMember,
			String etcNote, Long maxLimit, String dclsStrtDay, String dclsEndDay, String finCoSubmDay,
			List<OptionData> options) {
	}

	public record OptionData(String intrRateType, int saveTrm, BigDecimal intrRate, BigDecimal intrRate2) {
	}

	private final DepositProductRepository products;
	private final DepositRateOptionRepository options;
	private final Clock clock;

	DepositCatalogService(DepositProductRepository products, DepositRateOptionRepository options, Clock clock) {
		this.products = products;
		this.options = options;
		this.clock = clock;
	}

	@Transactional(readOnly = true)
	public long count() {
		return products.count();
	}

	/** 반영한 상품 수를 돌려준다. 빈 목록은 받아들이지 않는다(수집 실패로 기존 데이터를 지우지 않기 위해). */
	@Transactional
	public int replaceAll(List<ProductData> snapshot) {
		if (snapshot.isEmpty()) {
			throw new IllegalArgumentException("빈 정기예금 목록으로 교체할 수 없습니다");
		}
		Instant now = clock.instant();
		Set<Long> keep = new HashSet<>();
		for (ProductData d : snapshot) {
			DepositProduct p = products.findByFinCoNoAndFinPrdtCd(d.finCoNo(), d.finPrdtCd())
				.orElseGet(() -> new DepositProduct(d.finCoNo(), d.finPrdtCd()));
			boolean isNew = p.getId() == null;
			p.apply(d, now);
			p = products.saveAndFlush(p);
			if (!isNew) {
				options.deleteByProductId(p.getId());
			}
			Set<String> seen = new HashSet<>();
			for (OptionData o : d.options()) {
				// 같은 (금리 유형, 기간)이 두 번 오면 첫 값만 둔다(유니크 키)
				if (seen.add(o.intrRateType() + o.saveTrm())) {
					options.save(new DepositRateOption(p.getId(), o.intrRateType(), o.saveTrm(), o.intrRate(), o.intrRate2()));
				}
			}
			keep.add(p.getId());
		}
		List<Long> stale = products.findAll().stream().map(DepositProduct::getId).filter(id -> !keep.contains(id)).toList();
		if (!stale.isEmpty()) {
			options.deleteByProductIdIn(stale);
			products.deleteAllById(stale);
		}
		return snapshot.size();
	}
}
