package com.flexable.web.market;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.market.InsightDtos.IndexValue;
import com.flexable.web.market.MarketDtos.InstrumentRow;

/** 투자 인사이트 조회 4종: 주가 기간 경계·휴장일, 수집 대상 밖 404, 업종 빈 값 제외·정렬, 수집 전 칸 제외, 예시 자료 isSample. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:insight;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
class MarketInsightServiceTest {

	/** 금요일. 2026-07-23(목)은 휴장으로 두고 시세를 넣지 않는다. */
	static final LocalDate AS_OF = LocalDate.of(2026, 10, 23);
	static final LocalDate HOLIDAY = LocalDate.of(2026, 7, 23);

	@Autowired
	MarketService market;
	@Autowired
	MarketInsightService insight;
	@Autowired
	MarketIndexRepository indexRows;

	private static boolean seeded;

	@BeforeEach
	void seed() {
		if (seeded) {
			return;
		}
		seeded = true;
		market.replaceBoard(Board.KOSPI, List.of(
				new InstrumentRow("A00001", "가나전자", "KOSPI", "STOCK", 900L),
				new InstrumentRow("A00002", "다라금융", "KOSPI", "STOCK", 500L),
				new InstrumentRow("A00003", "마바전자", "KOSPI", "STOCK", 300L),
				new InstrumentRow("A00004", "사아금융", "KOSPI", "STOCK", 450L),
				new InstrumentRow("A00005", "자차없음", "KOSPI", "STOCK", 1000L),
				new InstrumentRow("A00006", "빠진종목", "KOSPI", "STOCK", 10L)), "테스트 목록", null, AS_OF);
		List<DailyClose> closes = new ArrayList<>();
		for (LocalDate d = AS_OF.minusYears(4); !d.isAfter(AS_OF); d = d.plusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY && !d.equals(HOLIDAY)) {
				closes.add(new DailyClose(d, 50_000 + d.getDayOfMonth()));
			}
		}
		market.saveDailyCloses("A00001", closes, Map.of(), "테스트용 가짜 시세");
		market.saveDailyCloses("A00006", closes, Map.of(), "테스트용 가짜 시세");
		// 빠진종목은 상위 목록에서 빠진다(시세는 남지만 수집 대상 밖)
		market.replaceBoard(Board.KOSPI, List.of(
				new InstrumentRow("A00005", "자차없음", "KOSPI", "STOCK", 1000L),
				new InstrumentRow("A00001", "가나전자", "KOSPI", "STOCK", 900L),
				new InstrumentRow("A00002", "다라금융", "KOSPI", "STOCK", 500L),
				new InstrumentRow("A00004", "사아금융", "KOSPI", "STOCK", 450L),
				new InstrumentRow("A00003", "마바전자", "KOSPI", "STOCK", 300L)), "테스트 목록", null, AS_OF);
		market.setIndustries(Map.of("A00001", " 전기전자 ", "A00002", "금융업", "A00003", "전기전자", "A00004", "금융업", "A00005", "  "), AS_OF);
	}

	@Test
	void 기간은_마지막_거래일에서_개월_수만큼_거슬러_간_날_이후_첫_거래일부터다() {
		var m3 = insight.prices("A00001", PricePeriod.M3);
		assertThat(m3.dataAsOf()).isEqualTo(AS_OF);
		assertThat(m3.endDate()).isEqualTo(AS_OF);
		assertThat(m3.startDate()).isEqualTo(HOLIDAY.plusDays(1)); // 7/23 휴장 → 7/24
		assertThat(m3.points().getFirst().date()).isEqualTo(m3.startDate());
		assertThat(m3.points().getLast().date()).isEqualTo(AS_OF);
		assertThat(m3.period()).isEqualTo("3M");
		assertThat(m3.basis()).isEqualTo("DAILY_ADJ_CLOSE");
		assertThat(m3.noticeKey()).isEqualTo("PRICE_PAST");

		assertThat(insight.prices("A00001", PricePeriod.M6).startDate()).isEqualTo(LocalDate.of(2026, 4, 23));
		assertThat(insight.prices("A00001", PricePeriod.Y1).startDate()).isEqualTo(LocalDate.of(2025, 10, 23));
		// 2023-10-23은 월요일
		assertThat(insight.prices("A00001", PricePeriod.Y3).startDate()).isEqualTo(LocalDate.of(2023, 10, 23));
		assertThat(PricePeriod.parse("5Y")).isEmpty();
	}

	@Test
	void 수집_대상_밖이거나_시세가_없는_종목은_404() {
		assertThatThrownBy(() -> insight.prices("A00006", PricePeriod.M3))
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.NOT_FOUND));
		assertThatThrownBy(() -> insight.prices("A00002", PricePeriod.M3)) // 시세 없음
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.NOT_FOUND));
		assertThatThrownBy(() -> insight.events("NOPE", PricePeriod.M3))
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.NOT_FOUND));
	}

	@Test
	void 사건_기간은_주가와_같다() {
		var e = insight.events("A00001", PricePeriod.M3);
		assertThat(e.startDate()).isEqualTo(HOLIDAY.plusDays(1));
		assertThat(e.endDate()).isEqualTo(AS_OF);
		assertThat(e.noticeKey()).isEqualTo("EVENT_EXPLAIN");
	}

	@Test
	void 업종은_빈_값을_빼고_시가총액_합이_큰_순으로_묶는다() {
		var l = insight.industries(Board.KOSPI, 5);
		// 전기전자 900+300=1200, 금융업 500+450=950. 자차없음(업종 빈 값)은 빠진다
		assertThat(l.items()).extracting(InsightDtos.IndustryItem::categoryName).containsExactly("전기전자", "금융업");
		assertThat(l.items().getFirst().totalMarketCap()).isEqualTo(1200L);
		assertThat(l.items().getFirst().instruments()).extracting(InsightDtos.IndustryInstrument::id).containsExactly("A00001", "A00003");
		assertThat(l.items().getFirst().instruments().getFirst().rank()).isEqualTo(2); // 시장 전체 순위
		assertThat(l.items().getFirst().categoryCode()).isEqualTo(PracticeMarketService.categoryCode("전기전자")).hasSize(24);
		assertThat(l.classificationVersion()).isEqualTo("KIWOOM_UPNAME_V1");
		assertThat(l.classificationAsOf()).isEqualTo(AS_OF);
		assertThat(l.note()).contains("상위 100개");
		assertThat(l.isSample()).isFalse();

		assertThat(insight.industries(Board.KOSPI, 1).items().getFirst().instruments()).hasSize(1);
		var empty = insight.industries(Board.KOSDAQ, 5);
		assertThat(empty.items()).isEmpty();
		assertThat(empty.classificationAsOf()).isNull();
	}

	@Test
	void 시장_띠는_전일_값이_있는_칸만_고정_순서로_보인다() {
		insight.saveIndex(IndexKey.KOSDAQ, List.of(new IndexValue(AS_OF.minusDays(1), new BigDecimal("850.00")),
				new IndexValue(AS_OF, new BigDecimal("861.25"))), "키움증권");
		insight.saveIndex(IndexKey.KOSPI, List.of(new IndexValue(AS_OF.minusDays(1), new BigDecimal("2600.10")),
				new IndexValue(AS_OF, new BigDecimal("2587.55"))), "키움증권");
		insight.saveIndex(IndexKey.GOLD, List.of(new IndexValue(AS_OF, new BigDecimal("150000"))), "한국거래소"); // 하루뿐 → 빠짐

		var strip = insight.indices();
		assertThat(strip.items()).extracting(InsightDtos.IndexItem::key).containsExactly(IndexKey.KOSPI, IndexKey.KOSDAQ);
		var kospi = strip.items().getFirst();
		assertThat(kospi.name()).isEqualTo("코스피");
		assertThat(kospi.change()).isEqualByComparingTo("-12.55");
		// −12.55 ÷ 2600.10 = −0.004826… → 음수는 더 작은 쪽으로 내림
		assertThat(kospi.changeRate()).isEqualByComparingTo("-0.0049");
		assertThat(strip.items().get(1).changeRate()).isEqualByComparingTo("0.0132"); // 11.25 ÷ 850 = 0.013235…
		assertThat(strip.sources()).extracting(InsightDtos.SourceRow::name).containsExactly("키움증권");
		assertThat(strip.isSample()).isFalse();

		// 정정: 같은 날 값을 다시 넣으면 고친다
		insight.saveIndex(IndexKey.KOSPI, List.of(new IndexValue(AS_OF, new BigDecimal("2610.10"))), "키움증권");
		assertThat(insight.indices().items().getFirst().changeRate()).isEqualByComparingTo("0.0038");
	}

	@Test
	void 시장_띠는_제공처가_다른_두_값으로_전일_대비를_내지_않는다() {
		// saveIndex는 다른 제공처 값을 지우므로, 남아 있는 경우를 저장소에 직접 넣어 흉내 낸다
		MarketIndexDaily fake = new MarketIndexDaily(IndexKey.KRXBOND, AS_OF.minusDays(1));
		fake.set(new BigDecimal("180.00"), "테스트용 가짜 지수", Instant.now());
		MarketIndexDaily real = new MarketIndexDaily(IndexKey.KRXBOND, AS_OF);
		real.set(new BigDecimal("191.00"), "한국거래소", Instant.now());
		indexRows.saveAll(List.of(fake, real));

		assertThat(insight.indices().items()).extracting(InsightDtos.IndexItem::key).doesNotContain(IndexKey.KRXBOND);
	}

	@Test
	void 가짜_소스_자료는_예시로_표시한다() {
		var p = insight.prices("A00001", PricePeriod.M3);
		assertThat(p.isSample()).isTrue();
		assertThat(p.sources()).extracting(InsightDtos.SourceRow::name).contains("테스트용 가짜 시세");
	}
}
