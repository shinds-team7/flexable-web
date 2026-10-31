package com.flexable.web.deposit;

import java.math.BigDecimal;

import jakarta.persistence.Column;
import jakarta.persistence.Entity;
import jakarta.persistence.GeneratedValue;
import jakarta.persistence.GenerationType;
import jakarta.persistence.Id;
import jakarta.persistence.Table;

/** 상품의 (금리 유형, 기간)별 금리. intr_rate가 기본금리, intr_rate2가 최고 우대금리다. */
@Entity
@Table(name = "deposit_rate_options")
class DepositRateOption {

	@Id
	@GeneratedValue(strategy = GenerationType.IDENTITY)
	private Long id;

	@Column(name = "product_id", nullable = false)
	private Long productId;

	@Column(name = "intr_rate_type", nullable = false, length = 1)
	private String intrRateType;

	@Column(name = "save_trm", nullable = false)
	private int saveTrm;

	@Column(name = "intr_rate", precision = 5, scale = 2)
	private BigDecimal intrRate;

	@Column(name = "intr_rate2", precision = 5, scale = 2)
	private BigDecimal intrRate2;

	protected DepositRateOption() {
	}

	DepositRateOption(long productId, String intrRateType, int saveTrm, BigDecimal intrRate, BigDecimal intrRate2) {
		this.productId = productId;
		this.intrRateType = intrRateType;
		this.saveTrm = saveTrm;
		this.intrRate = intrRate;
		this.intrRate2 = intrRate2;
	}

	Long getProductId() {
		return productId;
	}

	String getIntrRateType() {
		return intrRateType;
	}

	int getSaveTrm() {
		return saveTrm;
	}

	BigDecimal getIntrRate() {
		return intrRate;
	}

	BigDecimal getIntrRate2() {
		return intrRate2;
	}
}
