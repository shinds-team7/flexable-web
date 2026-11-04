package com.flexable.web.goalscenario;

/** 시나리오에 넣을 수 있는 상품 유형(policies §7-2). 응답 순서도 이 순서다. */
enum ProductType {
	SAVINGS(false), CMA(false), KR_INDEX_ETF(true), US_INDEX_ETF(true), KOSPI_TOP5(true);

	private final boolean invest;

	ProductType(boolean invest) {
		this.invest = invest;
	}

	/** 수익률이 경로마다 다른 투자 유형인지. */
	boolean invest() {
		return invest;
	}
}
