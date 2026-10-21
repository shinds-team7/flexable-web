package com.flexable.web.savings;

import java.time.Instant;

import com.flexable.web.savings.SavingsCatalogService.PolicyData;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 온통청년 청년정책 한 개(적금·저축·통장 계열). 금리가 없어 계산하지 않고 안내 정보만 둔다. */
@Entity
@Table(name = "savings_policies")
class SavingsPolicy {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "plcy_no", nullable = false, length = 40)
	private String plcyNo;

	@Column(name = "plcy_nm", nullable = false, length = 300)
	private String plcyNm;

	@Column(name = "plcy_expln_cn", columnDefinition = "TEXT")
	private String plcyExplnCn;

	@Column(name = "plcy_sprt_cn", columnDefinition = "TEXT")
	private String plcySprtCn;

	@Column(name = "lclsf_nm", length = 100)
	private String lclsfNm;

	@Column(name = "mclsf_nm", length = 100)
	private String mclsfNm;

	@Column(name = "sprvsn_inst_nm", length = 200)
	private String sprvsnInstNm;

	@Column(name = "oper_inst_nm", length = 200)
	private String operInstNm;

	@Column(name = "aply_ymd", length = 60)
	private String aplyYmd;

	@Column(name = "biz_prd_bgng_ymd", length = 8)
	private String bizPrdBgngYmd;

	@Column(name = "biz_prd_end_ymd", length = 8)
	private String bizPrdEndYmd;

	@Column(name = "biz_prd_etc_cn", length = 500)
	private String bizPrdEtcCn;

	@Column(name = "plcy_aply_mthd_cn", columnDefinition = "TEXT")
	private String plcyAplyMthdCn;

	@Column(name = "srng_mthd_cn", columnDefinition = "TEXT")
	private String srngMthdCn;

	@Column(name = "sbmsn_dcmnt_cn", columnDefinition = "TEXT")
	private String sbmsnDcmntCn;

	@Column(name = "aply_url_addr", length = 500)
	private String aplyUrlAddr;

	@Column(name = "ref_url_addr", length = 500)
	private String refUrlAddr;

	@Column(name = "etc_mttr_cn", columnDefinition = "TEXT")
	private String etcMttrCn;

	@Column(name = "sprt_trgt_min_age")
	private Integer sprtTrgtMinAge;

	@Column(name = "sprt_trgt_max_age")
	private Integer sprtTrgtMaxAge;

	@Column(name = "earn_etc_cn", columnDefinition = "TEXT")
	private String earnEtcCn;

	@Column(name = "add_aply_qlfc_cnd_cn", columnDefinition = "TEXT")
	private String addAplyQlfcCndCn;

	@Column(name = "ptcp_prp_trgt_cn", columnDefinition = "TEXT")
	private String ptcpPrpTrgtCn;

	@Column(name = "last_mdfcn_dt", length = 30)
	private String lastMdfcnDt;

	@Column(nullable = false, length = 20)
	private String region = "전국";

	@Column(name = "fetched_at", nullable = false)
	private Instant fetchedAt;

	protected SavingsPolicy() {
	}

	SavingsPolicy(String plcyNo) {
		this.plcyNo = plcyNo;
	}

	void apply(PolicyData d, Instant now) {
		this.plcyNm = d.plcyNm();
		this.plcyExplnCn = d.plcyExplnCn();
		this.plcySprtCn = d.plcySprtCn();
		this.lclsfNm = d.lclsfNm();
		this.mclsfNm = d.mclsfNm();
		this.sprvsnInstNm = d.sprvsnInstNm();
		this.operInstNm = d.operInstNm();
		this.aplyYmd = d.aplyYmd();
		this.bizPrdBgngYmd = d.bizPrdBgngYmd();
		this.bizPrdEndYmd = d.bizPrdEndYmd();
		this.bizPrdEtcCn = d.bizPrdEtcCn();
		this.plcyAplyMthdCn = d.plcyAplyMthdCn();
		this.srngMthdCn = d.srngMthdCn();
		this.sbmsnDcmntCn = d.sbmsnDcmntCn();
		this.aplyUrlAddr = d.aplyUrlAddr();
		this.refUrlAddr = d.refUrlAddr();
		this.etcMttrCn = d.etcMttrCn();
		this.sprtTrgtMinAge = d.sprtTrgtMinAge();
		this.sprtTrgtMaxAge = d.sprtTrgtMaxAge();
		this.earnEtcCn = d.earnEtcCn();
		this.addAplyQlfcCndCn = d.addAplyQlfcCndCn();
		this.ptcpPrpTrgtCn = d.ptcpPrpTrgtCn();
		this.lastMdfcnDt = d.lastMdfcnDt();
		this.region = d.region() == null || d.region().isBlank() ? "전국" : d.region();
		this.fetchedAt = now;
	}

	Long getId() {
		return id;
	}

	String getPlcyNo() {
		return plcyNo;
	}

	String getPlcyNm() {
		return plcyNm;
	}

	String getPlcyExplnCn() {
		return plcyExplnCn;
	}

	String getPlcySprtCn() {
		return plcySprtCn;
	}

	String getMclsfNm() {
		return mclsfNm;
	}

	String getSprvsnInstNm() {
		return sprvsnInstNm;
	}

	String getOperInstNm() {
		return operInstNm;
	}

	String getAplyYmd() {
		return aplyYmd;
	}

	String getBizPrdBgngYmd() {
		return bizPrdBgngYmd;
	}

	String getBizPrdEndYmd() {
		return bizPrdEndYmd;
	}

	String getBizPrdEtcCn() {
		return bizPrdEtcCn;
	}

	String getPlcyAplyMthdCn() {
		return plcyAplyMthdCn;
	}

	String getSrngMthdCn() {
		return srngMthdCn;
	}

	String getSbmsnDcmntCn() {
		return sbmsnDcmntCn;
	}

	String getAplyUrlAddr() {
		return aplyUrlAddr;
	}

	String getRefUrlAddr() {
		return refUrlAddr;
	}

	String getEtcMttrCn() {
		return etcMttrCn;
	}

	Integer getSprtTrgtMinAge() {
		return sprtTrgtMinAge;
	}

	Integer getSprtTrgtMaxAge() {
		return sprtTrgtMaxAge;
	}

	String getEarnEtcCn() {
		return earnEtcCn;
	}

	String getAddAplyQlfcCndCn() {
		return addAplyQlfcCndCn;
	}

	String getPtcpPrpTrgtCn() {
		return ptcpPrpTrgtCn;
	}

	String getRegion() {
		return region;
	}

	String getLastMdfcnDt() {
		return lastMdfcnDt;
	}

	Instant getFetchedAt() {
		return fetchedAt;
	}
}
