package com.flexable.web.virtualsim;

/**
 * 대회 판(티어, policies §8-8, decisions/2026-11-05-virtual-sim-contest 1-3·9). seedMoney: 판의 대회 시드머니(배치·승급·강등 때 잔액을 이 값으로 정한다).
 * 출제: 사건 4개·구간 120거래일 고정, 판의 변동성 등급에서 균등하게 뽑고, 뚜렷한 유형(UP·DOWN) clear개와 MIXED 유형 mixed개를 먼저 뽑는다.
 */
public enum VirtualContestBoard {

	B10M(10_000_000L, 2, 0, 0, 1),
	B50M(50_000_000L, 1, 1, 0, 1, 2),
	B100M(100_000_000L, 0, 2, 1, 2);

	private final long seedMoney;
	private final VirtualSimGenerator.Board rule;
	private final VirtualSimGenerator.Board ruleV1;

	VirtualContestBoard(long seedMoney, int clear, int mixed, int... grades) {
		this.seedMoney = seedMoney;
		this.rule = new VirtualSimGenerator.Board(VirtualContestRules.EVENTS, clear, mixed, grades, VirtualContestRules.ROUND_LENGTH);
		this.ruleV1 = new VirtualSimGenerator.Board(VirtualContestRules.EVENTS, clear, mixed, grades, 0);
	}

	public long seedMoney() {
		return seedMoney;
	}

	/** 생성기에 넘기는 판 규칙(지금 버전). 등급 배열은 복사본을 쓰지 않으므로 바꾸지 않는다 */
	VirtualSimGenerator.Board rule() {
		return rule;
	}

	/** 판을 시작할 때의 생성기 버전에 맞는 판 규칙(v1은 길이를 120~250에서 뽑음) */
	VirtualSimGenerator.Board rule(String generator) {
		return VirtualSimGenerator.V1.equals(generator) ? ruleV1 : rule;
	}

	public int[] grades() {
		return rule.grades().clone();
	}

	public int clear() {
		return rule.clear();
	}

	public int mixed() {
		return rule.mixed();
	}

	/** 한 단계 위(B100M은 그대로) */
	public VirtualContestBoard up() {
		return this == B100M ? this : values()[ordinal() + 1];
	}

	/** 한 단계 아래(B10M은 그대로) */
	public VirtualContestBoard down() {
		return this == B10M ? this : values()[ordinal() - 1];
	}
}
