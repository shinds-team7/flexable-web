package com.flexable.web.news;

/** 소식 카드 [계산해 보기]가 여는 내부 화면. 승인된 키만 둔다(03 §8: 임의 경로를 저장하지 않는다). */
public enum CalcTarget {
	/** 정책 적금(F2-b)을 켠 채 적금 비교를 연다(01 F2-b) */
	POLICY_SAVINGS("/savings?policy=1", "정책 적금 계산해 보기"),
	SAVINGS("/savings", "적금 비교해 보기");

	private final String to;
	private final String label;

	CalcTarget(String to, String label) {
		this.to = to;
		this.label = label;
	}

	public String to() {
		return to;
	}

	public String label() {
		return label;
	}
}
