package com.flexable.web.savings;

import java.time.Instant;

import com.flexable.web.savings.SavingsCatalogService.ProductData;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 공시된 적금 상품 한 개(finlife baseinfo). 금리는 {@link SavingsRateOption}에 있다. */
@Entity
@Table(name = "savings_products")
class SavingsProduct {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "fin_co_no", nullable = false, length = 20)
	private String finCoNo;

	@Column(name = "fin_prdt_cd", nullable = false, length = 60)
	private String finPrdtCd;

	@Column(nullable = false, length = 20)
	private String sector;

	@Column(name = "dcls_month", nullable = false, length = 6)
	private String dclsMonth;

	@Column(name = "kor_co_nm", nullable = false, length = 100)
	private String korCoNm;

	@Column(name = "fin_prdt_nm", nullable = false, length = 200)
	private String finPrdtNm;

	@Column(name = "join_way", length = 100)
	private String joinWay;

	@Column(name = "mtrt_int", columnDefinition = "TEXT")
	private String mtrtInt;

	@Column(name = "spcl_cnd", columnDefinition = "TEXT")
	private String spclCnd;

	@Column(name = "join_deny", length = 1)
	private String joinDeny;

	@Column(name = "join_member", columnDefinition = "TEXT")
	private String joinMember;

	@Column(name = "etc_note", columnDefinition = "TEXT")
	private String etcNote;

	@Column(name = "max_limit")
	private Long maxLimit;

	@Column(name = "dcls_strt_day", length = 8)
	private String dclsStrtDay;

	@Column(name = "dcls_end_day", length = 8)
	private String dclsEndDay;

	@Column(name = "fin_co_subm_day", length = 12)
	private String finCoSubmDay;

	@Column(name = "fetched_at", nullable = false)
	private Instant fetchedAt;

	protected SavingsProduct() {
	}

	SavingsProduct(String finCoNo, String finPrdtCd) {
		this.finCoNo = finCoNo;
		this.finPrdtCd = finPrdtCd;
	}

	void apply(ProductData d, Instant now) {
		this.sector = d.sector();
		this.dclsMonth = d.dclsMonth();
		this.korCoNm = d.korCoNm();
		this.finPrdtNm = d.finPrdtNm();
		this.joinWay = d.joinWay();
		this.mtrtInt = d.mtrtInt();
		this.spclCnd = d.spclCnd();
		this.joinDeny = d.joinDeny();
		this.joinMember = d.joinMember();
		this.etcNote = d.etcNote();
		this.maxLimit = d.maxLimit();
		this.dclsStrtDay = d.dclsStrtDay();
		this.dclsEndDay = d.dclsEndDay();
		this.finCoSubmDay = d.finCoSubmDay();
		this.fetchedAt = now;
	}

	Long getId() {
		return id;
	}

	String getFinCoNo() {
		return finCoNo;
	}

	String getFinPrdtCd() {
		return finPrdtCd;
	}

	String getSector() {
		return sector;
	}

	String getDclsMonth() {
		return dclsMonth;
	}

	String getKorCoNm() {
		return korCoNm;
	}

	String getFinPrdtNm() {
		return finPrdtNm;
	}

	String getSpclCnd() {
		return spclCnd;
	}

	String getJoinDeny() {
		return joinDeny;
	}

	String getJoinMember() {
		return joinMember;
	}

	Long getMaxLimit() {
		return maxLimit;
	}

	Instant getFetchedAt() {
		return fetchedAt;
	}
}
