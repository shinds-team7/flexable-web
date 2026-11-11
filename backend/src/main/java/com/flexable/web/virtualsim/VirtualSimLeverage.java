package com.flexable.web.virtualsim;

import java.util.ArrayList;
import java.util.List;

import com.flexable.web.market.PracticeMarketData.Candle;

/**
 * 레버리지 판 가격(policies §8-9, decisions/2026-11-11-vsim-leverage). 레버리지 ETF 방식이라 차입·이자·반대매매가 없고, 기초 종목의 하루 등락률에
 * 배율을 곱해 매일 다시 맞춘다. 운용보수·괴리·세금은 넣지 않는다. 1배는 기초 봉 그대로다.
 */
public final class VirtualSimLeverage {

	public static final int MIN = 1;
	public static final int MAX = 3;

	private VirtualSimLeverage() {
	}

	/**
	 * 기초 종목의 전날 종가 C, 레버리지 가격의 전날 종가 L, 그날 기초 가격 X → max(1, floor(L × (C + k × (X − C)) / C)).
	 * 하루 상하한이 ±30%라 3배여도 C + k × (X − C) > 0이고, 식이 X에 대해 단조라 봉 순서가 유지된다
	 */
	public static long price(long prevLeveraged, long prevBase, long base, int k) {
		long moved = Math.addExact(prevBase, Math.multiplyExact(k, base - prevBase));
		return Math.max(1, Math.floorDiv(Math.multiplyExact(prevLeveraged, moved), prevBase));
	}

	/** 기초 봉 → k배 봉. 첫 봉의 C·L은 시작가. 1배면 기초 봉을 그대로 돌려준다. 너무 커져 long을 넘으면 ArithmeticException */
	public static List<Candle> convert(List<Candle> base, long startPrice, int k) {
		if (k < MIN || k > MAX) {
			throw new IllegalArgumentException("배율은 1~3이에요");
		}
		if (k == 1) {
			return base;
		}
		List<Candle> out = new ArrayList<>(base.size());
		long c = startPrice, l = startPrice;
		for (Candle b : base) {
			Candle x = new Candle(b.date(), price(l, c, b.open(), k), price(l, c, b.high(), k), price(l, c, b.low(), k), price(l, c, b.close(), k));
			out.add(x);
			c = b.close();
			l = x.close();
		}
		return List.copyOf(out);
	}
}
