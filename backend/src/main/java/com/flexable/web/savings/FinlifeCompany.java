package com.flexable.web.savings;

import java.time.Instant;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** finlife 금융회사 공시 한 곳(companySearch baseinfo). 상품 상세의 홈페이지 링크에만 쓴다(#449). */
@Entity
@Table(name = "finlife_companies")
class FinlifeCompany {

	@Id
	@Column(name = "fin_co_no", nullable = false, length = 20)
	private String finCoNo;

	@Column(name = "kor_co_nm", nullable = false, length = 100)
	private String korCoNm;

	@Column(name = "homepage_url", length = 300)
	private String homepageUrl;

	@Column(name = "fetched_at", nullable = false)
	private Instant fetchedAt;

	protected FinlifeCompany() {
	}

	FinlifeCompany(String finCoNo) {
		this.finCoNo = finCoNo;
	}

	void apply(String korCoNm, String homepageUrl, Instant now) {
		this.korCoNm = korCoNm;
		this.homepageUrl = homepageUrl;
		this.fetchedAt = now;
	}

	String getFinCoNo() {
		return finCoNo;
	}

	String getHomepageUrl() {
		return homepageUrl;
	}
}
