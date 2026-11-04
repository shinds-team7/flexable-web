package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.SplittableRandom;

import org.junit.jupiter.api.Test;

import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.virtualsim.VirtualSimRules.Filing;
import com.flexable.web.virtualsim.VirtualSimRules.Series;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;

/** 룰셋 추출(policies §8-3, decisions 1-3~1-7)을 합성 시세로 확인한다. 공시 뒤 5거래일을 정해 두고 유형별 경로·경향·평소 하루 분포가 맞게 나오는지 본다 */
class VirtualSimRulesTest {

	private static final String[] TITLES = { "단일판매ㆍ공급계약체결", "주요사항보고서(유상증자결정)", "현금ㆍ현물배당결정" };

	/** 종목 6개, 평일 1,300일. 10거래일마다 공시(공급 계약 → 유상증자 → 배당 순). 공급 계약 뒤 5일은 +1%, 유상증자 뒤 5일은 −1%, 배당 뒤와 평소는 무작위 */
	private static VirtualSimRules.Input input(int stocks, boolean withOhlc) {
		SplittableRandom rnd = new SplittableRandom(7);
		List<Series> series = new ArrayList<>();
		Map<String, List<Filing>> filings = new HashMap<>();
		Map<String, List<Candle>> ohlc = new HashMap<>();
		List<LocalDate> dates = new ArrayList<>();
		for (LocalDate d = LocalDate.of(2021, 11, 1); dates.size() < 1300; d = d.plusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				dates.add(d);
			}
		}
		for (int s = 0; s < stocks; s++) {
			String code = "A0000" + s;
			int spread = 50 + s * 60;
			List<Long> closes = new ArrayList<>();
			List<Long> volumes = new ArrayList<>();
			List<Filing> list = new ArrayList<>();
			long price = 10_000;
			int drift = 0, left = 0;
			for (int i = 0; i < dates.size(); i++) {
				if (i > 0) {
					int r = left > 0 ? drift : rnd.nextInt(-spread, spread + 1);
					left--;
					price = Math.max(100, Math.floorDiv(price * (10_000 + r), 10_000L));
				}
				closes.add(price);
				volumes.add(1_000L + rnd.nextInt(100));
				if (i > 0 && i % 10 == 0) {
					int t = (i / 10) % 3;
					list.add(new Filing(code + String.format("%06d", i), TITLES[t], dates.get(i)));
					drift = t == 0 ? 100 : t == 1 ? -100 : rnd.nextInt(-spread, spread + 1);
					left = 5;
				}
			}
			series.add(new Series(code, List.copyOf(dates), closes, volumes));
			filings.put(code, list);
			if (withOhlc) {
				List<Candle> candles = new ArrayList<>();
				for (int i = 0; i < 300; i++) {
					long c = closes.get(i);
					candles.add(new Candle(dates.get(i).toString(), c, c + 10 + s, Math.max(1, c - 10 - s), c));
				}
				ohlc.put(code, candles);
			}
		}
		return new VirtualSimRules.Input(series, filings, ohlc, List.of("테스트 시세"));
	}

	@Test
	void 유형별_경로와_경향() {
		VirtualSimRuleset rules = VirtualSimRules.build(input(6, true)).orElseThrow();
		assertThat(rules.version()).isEqualTo(VirtualSimRuleset.VERSION);
		assertThat(rules.isSample()).isFalse();
		assertThat(rules.dataFrom()).isEqualTo("2021-11-01");
		assertThat(rules.categories()).extracting(CategoryStats::category)
			.containsExactlyInAnyOrder(VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.NEW_SHARES, VirtualSimCategory.DIVIDEND);
		CategoryStats supply = rules.stats(VirtualSimCategory.SUPPLY_CONTRACT).orElseThrow();
		assertThat(supply.trend()).isEqualTo("UP");
		assertThat(supply.upShare()).isEqualByComparingTo(BigDecimal.ONE);
		assertThat(supply.samples()).allSatisfy(p -> assertThat(Arrays.stream(p).allMatch(r -> r >= 90 && r <= 100)).isTrue());
		assertThat(supply.paths()).isEqualTo(supply.up() + supply.down() + supply.flat());
		assertThat(supply.samples()).hasSize(Math.min(500, supply.paths()));
		assertThat(rules.stats(VirtualSimCategory.NEW_SHARES).orElseThrow().trend()).isEqualTo("DOWN");
		assertThat(supply.volumeRatio()).isNotNull();
		assertThat(rules.grades()).hasSize(3).allSatisfy(g -> {
			assertThat(g.r()).hasSize(1001);
			assertThat(g.g()).hasSize(1001);
		});
		// 가장 낮은 등급은 하루 등락 폭이 가장 작은 두 종목(±50·±110)이다
		assertThat(rules.grades().getFirst().r()[0]).isGreaterThanOrEqualTo(-111);
		assertThat(rules.grades().getFirst().r()[1000]).isLessThanOrEqualTo(111);
	}

	@Test
	void 조건을_못_채우면_룰셋을_만들지_않는다() {
		// 갭·꼬리 표본(OHLC)이 없으면 만들지 않는다
		assertThat(VirtualSimRules.build(input(6, false))).isEmpty();
		// 종목이 적어 등급마다 평소 하루가 1,000개가 안 된다
		assertThat(VirtualSimRules.build(input(2, true))).isEmpty();
	}

	@Test
	void 거래량_배수() {
		List<Long> v = new ArrayList<>();
		for (int i = 0; i < 20; i++) {
			v.add(100L);
		}
		v.add(999L); // 기준일
		for (int i = 0; i < 5; i++) {
			v.add(300L);
		}
		assertThat(VirtualSimRules.volumeRatio(v, 20)).isEqualByComparingTo("3");
		assertThat(VirtualSimRules.volumeRatio(v, 19)).isNull(); // 기준일 전 봉 20개 미만
		List<Long> missing = new ArrayList<>(v);
		missing.set(22, null);
		assertThat(VirtualSimRules.volumeRatio(missing, 20)).isNull();
		List<Long> zero = new ArrayList<>(v);
		for (int i = 0; i < 20; i++) {
			zero.set(i, 0L);
		}
		assertThat(VirtualSimRules.volumeRatio(zero, 20)).isNull();
		assertThat(VirtualSimRules.median(List.of(new BigDecimal("1.25"), new BigDecimal("3")))).isEqualByComparingTo("2.1");
		assertThat(VirtualSimRules.median(List.of(new BigDecimal("1.29")))).isEqualByComparingTo("1.2");
		assertThat(VirtualSimRules.median(List.of())).isNull();
	}

	@Test
	void 룰셋은_JSON으로_저장해도_같다() {
		VirtualSimRuleset rules = VirtualSimSample.ruleset();
		var json = tools.jackson.databind.json.JsonMapper.builder().findAndAddModules().build();
		VirtualSimRuleset back = json.readValue(json.writeValueAsString(rules), VirtualSimRuleset.class);
		assertThat(back).usingRecursiveComparison().isEqualTo(rules);
	}
}
