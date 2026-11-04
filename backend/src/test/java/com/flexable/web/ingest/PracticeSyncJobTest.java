package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.DayOfWeek;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.function.Function;
import java.util.stream.Collectors;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;

import com.flexable.web.ingest.fake.FakePracticeData;
import com.flexable.web.market.Board;
import com.flexable.web.market.EventDtos.EventView;
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketDtos.BoardListing;
import com.flexable.web.market.MarketDtos.InstrumentView;
import com.flexable.web.market.MarketService;
import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.market.PracticeMarketData.Dataset;
import com.flexable.web.market.PracticeMarketData.Instrument;
import com.flexable.web.market.PracticeMarketData.News;
import com.flexable.web.market.PracticeMarketService;
import com.flexable.web.market.PracticeWindow;

/**
 * 종목마다 문제를 3개 이상 만나는 가장 짧은(120거래일 이상) 구간을 골라 저장하고, 시세를 못 받은 종목은 직전 묶음을 그대로 두는지 본다.
 * 저장은 실제 practice_datasets(H2), 외부 소스는 가짜로 둔다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:practice-sync;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
class PracticeSyncJobTest {

	private static final LocalDate TODAY = LocalDate.of(2026, 11, 3);

	@Autowired
	PracticeMarketService store;

	/** TODAY에서 끝나는 평일 일봉 count개 */
	private static List<DailyBar> bars(int count) {
		var out = new ArrayList<DailyBar>();
		for (var d = TODAY; out.size() < count; d = d.minusDays(1)) {
			if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) {
				out.addFirst(new DailyBar(d, 1000, 1L, 1000L, 1010L, 990L));
			}
		}
		return out;
	}

	/** 봉 위치마다 공시 하나를 근거로 단 사건 */
	private static List<EventView> events(String code, List<DailyBar> bars, int... positions) {
		var out = new ArrayList<EventView>();
		for (int p : positions) {
			LocalDate date = bars.get(p).date();
			out.add(new EventView(p, code, "STOCK", date, date, 5, "UP", 0.1, null, 1.0, 1,
					List.of(new EvidenceRow("DISCLOSURE", code + "-" + p, "공시 " + p, "DART", date, "https://dart.fss.or.kr/", 1)), date));
		}
		return out;
	}

	private static Dataset previous(String code, String category) {
		var candles = bars(120).stream().map(b -> new Candle(b.date().minusYears(1).toString(), 900, 910, 890, 900)).toList();
		return new Dataset(new Instrument(code, "직전 " + code, PracticeMarketService.categoryCode(category), category, "KIWOOM_UPNAME_V1", "2026-10-01"),
				candles, List.of(new News("old-" + code, "직전 공시", candles.get(20).date(), "https://dart.fss.or.kr/", "금융감독원 DART")), false, List.of("직전 수집"));
	}

	@Test
	void 종목마다_공시가_몰린_구간을_저장하고_실패한_종목은_직전_묶음을_둔다() {
		var oldA = previous("000001", "전기전자");
		var oldC = previous("000003", "금융업");
		store.save(oldA);
		store.save(oldC);

		InstrumentSource industries = mock(InstrumentSource.class);
		when(industries.listing(Board.KOSPI)).thenReturn(new InstrumentListing(List.of(
				new InstrumentInfo("000001", "가종목", "KOSPI", "STOCK", 3L, "전기전자"),
				new InstrumentInfo("000002", "나종목", "KOSPI", "STOCK", 2L, "전기전자"),
				new InstrumentInfo("000003", "다종목", "KOSPI", "STOCK", 1L, "금융업")), "test", null));
		when(industries.listing(Board.KOSDAQ)).thenThrow(new IllegalStateException("목록 실패"));
		MarketService market = mock(MarketService.class);
		when(market.board(Board.KOSPI)).thenReturn(new BoardListing(Board.KOSPI, List.of(
				new InstrumentView("000001", "가종목", "KOSPI", "STOCK", Board.KOSPI, 1, 3L),
				new InstrumentView("000002", "나종목", "KOSPI", "STOCK", Board.KOSPI, 2, 2L),
				new InstrumentView("000003", "다종목", "KOSPI", "STOCK", Board.KOSPI, 3, 1L)), "test", null, TODAY));
		PriceSource prices = mock(PriceSource.class);
		when(prices.source()).thenReturn("테스트 일봉");
		List<DailyBar> history = bars(300);
		LocalDate from = TODAY.minusYears(PracticeSyncJob.SEARCH_YEARS);
		when(prices.dailyBars(eq("000001"), eq(from), eq(TODAY))).thenReturn(history);
		when(prices.dailyBars(eq("000002"), eq(from), eq(TODAY))).thenReturn(history);
		when(prices.dailyBars(eq("000003"), any(), any())).thenThrow(new IllegalStateException("시세 실패"));
		EventService events = mock(EventService.class);
		// 가: 50·77·104번째 봉에 몰림, 260번째 봉에 단건(최근 창) → 36번째 봉부터
		when(events.eventsBetween(eq(List.of("000001")), any(), any())).thenReturn(events("000001", history, 50, 77, 104, 260));
		// 나: 150·210·265번째 봉으로 넓게 퍼져 120거래일에는 3개가 안 됨 → 136번째 봉부터 135거래일
		when(events.eventsBetween(eq(List.of("000002")), any(), any())).thenReturn(events("000002", history, 150, 210, 265));
		var props = new IngestProperties("kiwoom", null, null, null, null, null, null, null, null, null, null, null, null);
		var clock = Clock.fixed(TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul"));

		new PracticeSyncJob(market, events, store, prices, props, clock, industries).runOnce();

		Map<String, Dataset> saved = store.all().stream().collect(Collectors.toMap(d -> d.instrument().code(), Function.identity()));
		assertThat(saved).containsOnlyKeys("000001", "000002", "000003");
		var a = saved.get("000001");
		assertThat(a.candles()).hasSize(120);
		assertThat(a.candles().getFirst().date()).isEqualTo(history.get(36).date().toString());
		assertThat(a.news()).extracting(News::id).containsExactly("000001-50", "000001-77", "000001-104");
		assertThat(a.instrument().categoryName()).isEqualTo("전기전자");
		var b = saved.get("000002");
		assertThat(b.candles()).hasSize(135);
		assertThat(b.candles().getFirst().date()).isEqualTo(history.get(136).date().toString());
		assertThat(b.news()).extracting(News::id).containsExactly("000002-150", "000002-210", "000002-265");
		// 시세를 못 받은 종목은 직전 성공 묶음 그대로
		assertThat(saved.get("000003")).isEqualTo(oldC);
	}

	@Test
	void 문제를_3개_이상_만나는_구간이_없으면_저장하지_않는다() {
		InstrumentSource industries = mock(InstrumentSource.class);
		when(industries.listing(Board.KOSPI)).thenReturn(new InstrumentListing(List.of(
				new InstrumentInfo("000009", "라종목", "KOSPI", "STOCK", 1L, "운수장비")), "test", null));
		when(industries.listing(Board.KOSDAQ)).thenReturn(new InstrumentListing(List.of(), "test", null));
		MarketService market = mock(MarketService.class);
		when(market.board(Board.KOSPI)).thenReturn(new BoardListing(Board.KOSPI, List.of(
				new InstrumentView("000009", "라종목", "KOSPI", "STOCK", Board.KOSPI, 1, 1L)), "test", null, TODAY));
		when(market.board(Board.KOSDAQ)).thenReturn(new BoardListing(Board.KOSDAQ, List.of(), "test", null, TODAY));
		PriceSource prices = mock(PriceSource.class);
		List<DailyBar> history = bars(200);
		when(prices.dailyBars(eq("000009"), any(), any())).thenReturn(history);
		EventService events = mock(EventService.class);
		// 출제할 수 있는 공시가 2개뿐이다(5·197번째는 시작 14거래일·사건 뒤 5거래일을 채우지 못한다)
		when(events.eventsBetween(eq(List.of("000009")), any(), any())).thenReturn(events("000009", history, 5, 40, 120, 197));
		var props = new IngestProperties("kiwoom", null, null, null, null, null, null, null, null, null, null, null, null);
		var clock = Clock.fixed(TODAY.atStartOfDay(ZoneId.of("Asia/Seoul")).toInstant(), ZoneId.of("Asia/Seoul"));

		new PracticeSyncJob(market, events, store, prices, props, clock, industries).runOnce();

		assertThat(store.all()).noneMatch(d -> d.instrument().code().equals("000009"));
	}

	@Test
	void 예시_자료도_같은_규칙으로_회사마다_다른_구간과_길이를_고른다() {
		var sample = FakePracticeData.create(TODAY);
		assertThat(sample).hasSize(6).allMatch(Dataset::isSample);
		assertThat(sample).allSatisfy(d -> {
			boolean wide = Integer.parseInt(d.instrument().code().substring(6)) % 2 == 1;
			assertThat(d.candles()).hasSize(wide ? 135 : 120);
			assertThat(PracticeWindow.questions(d.candles(), d.news())).extracting(PracticeWindow.Question::index)
				.containsExactlyElementsOf(wide ? List.of(14, 74, 129) : List.of(14, 41, 77));
		});
		assertThat(sample).extracting(d -> d.candles().getFirst().date()).doesNotHaveDuplicates();
	}
}
