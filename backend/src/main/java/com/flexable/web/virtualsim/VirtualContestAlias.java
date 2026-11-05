package com.flexable.web.virtualsim;

import java.util.List;
import java.util.random.RandomGenerator;

/**
 * 대회 익명 별명(vsim-alias-v1, decisions/2026-11-05-virtual-sim-contest 7-4). 형용사 + 동물 + 네 자리 숫자(예: 느긋한수달0427).
 * 회원이 정하지 않고 바꿀 수 없다. 이미 쓰는 별명이면 다시 뽑는다. 낱말을 바꾸면 VERSION을 올린다(이미 붙인 별명은 그대로).
 */
public final class VirtualContestAlias {

	private VirtualContestAlias() {
	}

	public static final String VERSION = "vsim-alias-v1";

	static final List<String> ADJECTIVES = List.of("느긋한", "용감한", "차분한", "부지런한", "씩씩한", "다정한", "명랑한", "슬기로운", "날쌘", "꼼꼼한",
			"든든한", "반짝이는", "포근한", "단단한", "산뜻한", "너그러운", "재빠른", "침착한", "튼튼한", "상냥한", "호기심많은", "조용한", "활발한", "신중한");

	static final List<String> ANIMALS = List.of("수달", "다람쥐", "고래", "펭귄", "여우", "부엉이", "고슴도치", "판다", "해달", "토끼", "거북이", "돌고래",
			"너구리", "코알라", "알파카", "참새", "두더지", "물개", "기린", "라쿤", "햄스터", "사슴", "까치", "북극곰");

	/** 별명 하나를 뽑는다 */
	public static String draw(RandomGenerator random) {
		return ADJECTIVES.get(random.nextInt(ADJECTIVES.size())) + ANIMALS.get(random.nextInt(ANIMALS.size()))
				+ String.format("%04d", random.nextInt(10_000));
	}
}
