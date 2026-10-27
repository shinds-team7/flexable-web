package com.flexable.web.market;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashMap;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Objects;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.market.InsightDtos.IndexItem;
import com.flexable.web.market.InsightDtos.IndexStrip;
import com.flexable.web.market.InsightDtos.IndexValue;
import com.flexable.web.market.InsightDtos.IndustryInstrument;
import com.flexable.web.market.InsightDtos.IndustryItem;
import com.flexable.web.market.InsightDtos.IndustryListing;
import com.flexable.web.market.InsightDtos.PriceEventItem;
import com.flexable.web.market.InsightDtos.PriceEvents;
import com.flexable.web.market.InsightDtos.PricePoint;
import com.flexable.web.market.InsightDtos.PriceSeries;
import com.flexable.web.market.InsightDtos.SourceRow;

/**
 * 투자 인사이트(/invest) 조회: 종목 일별 종가·기간 사건·시장 띠·업종별 목록(decisions/2026-10-26-invest-insight-redesign).
 * 화면 차트용 일별 종가만 주고 시가·고가·저가·거래량은 주지 않는다(④). 외부 API는 부르지 않는다(04 §8).
 */
@Service
public class MarketInsightService {

	/** 가짜 소스(테스트·오프라인 확인용) 이름의 앞머리. 이 출처의 자료는 isSample=true로 내려 "예시"를 붙이게 한다. */
	public static final String SAMPLE_SOURCE_PREFIX = "테스트용";
	static final String CLASSIFICATION_VERSION = "KIWOOM_UPNAME_V1";
	static final String INDUSTRY_SOURCE = "키움증권";
	static final String INDUSTRY_SOURCE_NOTE = "종목정보 리스트(ka10099) 업종명";
	static final String SAMPLE_INDUSTRY_SOURCE = "테스트용 가짜 업종";

	private final InstrumentRepository instruments;
	private final DailyPriceRepository prices;
	private final MarketIndexRepository indices;
	private final EventService events;
	private final MarketProperties props;
	private final Clock clock;

	public MarketInsightService(InstrumentRepository instruments, DailyPriceRepository prices, MarketIndexRepository indices,
			EventService events, MarketProperties props, Clock clock) {
		this.instruments = instruments;
		this.prices = prices;
		this.indices = indices;
		this.events = events;
		this.props = props;
		this.clock = clock;
	}

	// ───────── 읽기(api) ─────────

	/** 기간 안 일별 종가. 수집 대상이 아니거나 시세가 없으면 404. */
	@Transactional(readOnly = true)
	public PriceSeries prices(String code, PricePeriod period) {
		Instrument inst = selectable(code);
		Range range = range(inst, period);
		List<DailyPrice> rows = prices.findByInstrumentIdAndTradeDateGreaterThanEqualOrderByTradeDateAsc(inst.getId(), range.from());
		String priceSource = rows.getLast().getSource();
		List<SourceRow> sources = List.of(new SourceRow(priceSource, "일별 종가(수정주가)"), new SourceRow(inst.getSource(), "종목 이름·시장"));
		return new PriceSeries(inst.getCode(), inst.getName(), inst.getKind(), period.code(), rows.getFirst().getTradeDate(),
				range.asOf(), range.asOf(), "DAILY_ADJ_CLOSE", rows.stream().map(p -> new PricePoint(p.getTradeDate(), p.getClose())).toList(),
				sources, InsightDtos.PRICE_NOTICE_KEY, InsightDtos.PRICE_NOTICE, isSample(priceSource) || isSample(inst.getSource()));
	}

	/** 기간(prices와 같은 첫 거래일~마지막 거래일)에 시작한 종목 사건 + 시장 사건. 금액 필드는 없다. */
	@Transactional(readOnly = true)
	public PriceEvents events(String code, PricePeriod period) {
		Instrument inst = selectable(code);
		Range range = range(inst, period);
		LocalDate start = prices.findFirstByInstrumentIdAndTradeDateGreaterThanEqualOrderByTradeDateAsc(inst.getId(), range.from())
			.map(DailyPrice::getTradeDate)
			.orElse(range.asOf());
		List<PriceEventItem> items = events.eventsBetween(List.of(code), start, range.asOf()).stream().map(e -> {
			boolean marketWide = MarketEvent.MARKET.equals(e.scope());
			var top = e.sources().isEmpty() ? null : e.sources().getFirst();
			return new PriceEventItem(e.id(), marketWide ? null : e.code(), e.scope(), e.startDate(), e.endDate(), e.windowDays(), e.direction(),
					e.returnRate(), e.marketReturn(), EventDtos.headline(inst.getName(), e.scope(), e.direction(), e.windowDays()), false,
					top == null ? null : "DART 공시", e.sources().size(), top == null ? null : top.title(), e.score());
		}).toList();
		return new PriceEvents(inst.getCode(), period.code(), start, range.asOf(), items, EventDtos.NOTICE_KEY);
	}

	/** 시장 띠. IndexKey 순서 고정, 마지막 값과 그 앞 값이 모두 있는 칸만 보인다(수집 전 칸은 뺀다). */
	@Transactional(readOnly = true)
	public IndexStrip indices() {
		List<IndexItem> items = new ArrayList<>();
		Set<String> sourceNames = new LinkedHashSet<>();
		for (IndexKey key : IndexKey.values()) {
			List<MarketIndexDaily> last = indices.findTop2ByIndexKeyOrderByTradeDateDesc(key);
			if (last.size() < 2) {
				continue;
			}
			MarketIndexDaily now = last.get(0);
			BigDecimal value = now.getValue().setScale(key.scale(), RoundingMode.DOWN);
			BigDecimal prev = last.get(1).getValue().setScale(key.scale(), RoundingMode.DOWN);
			if (prev.signum() <= 0) {
				continue;
			}
			BigDecimal change = value.subtract(prev);
			items.add(new IndexItem(key, key.label(), key.kind(), key.unit(), value, prev, change, changeRate(value, prev), now.getTradeDate(),
					now.getSource()));
			sourceNames.add(now.getSource());
		}
		List<SourceRow> sources = sourceNames.stream().map(n -> new SourceRow(n, null)).toList();
		return new IndexStrip(items, sources, sourceNames.stream().anyMatch(MarketInsightService::isSample));
	}

	/** (value − prev) ÷ prev, 소수 4자리 내림(음수는 더 작은 쪽, policies 공통 규칙). */
	static BigDecimal changeRate(BigDecimal value, BigDecimal prev) {
		return value.subtract(prev).divide(prev, 4, RoundingMode.FLOOR);
	}

	/**
	 * 업종별 시가총액 상위 종목. 수집 대상(시장별 상위 topLimit) 안에서만 묶고 업종 빈 값은 뺀다.
	 * 업종은 업종 안 시가총액 합이 큰 순(같으면 업종 안 최고 순위가 높은 순), 업종 안 종목은 시가총액 순위 순.
	 */
	@Transactional(readOnly = true)
	public IndustryListing industries(Board board, int limit) {
		List<Instrument> ranked = instruments.findByBoardAndCapRankNotNullOrderByCapRankAsc(board).stream()
			.limit(props.topLimit())
			.filter(i -> i.getIndustryName() != null && !i.getIndustryName().isBlank())
			.toList();
		Map<String, List<Instrument>> byIndustry = new LinkedHashMap<>();
		ranked.forEach(i -> byIndustry.computeIfAbsent(i.getIndustryName(), k -> new ArrayList<>()).add(i));
		Map<String, Long> totals = new HashMap<>();
		byIndustry.forEach((name, list) -> totals.put(name, total(list)));
		List<IndustryItem> items = byIndustry.entrySet().stream()
			.sorted(Comparator.comparing((Map.Entry<String, List<Instrument>> e) -> totals.get(e.getKey()),
					Comparator.nullsLast(Comparator.reverseOrder()))
				.thenComparing(e -> e.getValue().getFirst().getCapRank()))
			.map(e -> new IndustryItem(PracticeMarketService.categoryCode(e.getKey()), e.getKey(), totals.get(e.getKey()),
					e.getValue().stream().limit(limit)
						.map(i -> new IndustryInstrument(i.getCode(), i.getName(), i.getCapRank(), i.getMarketCap()))
						.toList()))
			.toList();
		if (items.isEmpty()) {
			return new IndustryListing(board, List.of(), CLASSIFICATION_VERSION, null, List.of(), null, false);
		}
		LocalDate asOf = ranked.stream().map(Instrument::getIndustryAsOf).filter(Objects::nonNull).max(LocalDate::compareTo).orElse(null);
		boolean sample = ranked.stream().anyMatch(i -> isSample(i.getSource()));
		String note = "지금 업종을 지난 기간에도 그대로 적용했고, 시장별 시가총액 상위 " + props.topLimit() + "개 종목 안에서만 묶었어요.";
		List<SourceRow> sources = List.of(new SourceRow(sample ? SAMPLE_INDUSTRY_SOURCE : INDUSTRY_SOURCE, INDUSTRY_SOURCE_NOTE));
		return new IndustryListing(board, items, CLASSIFICATION_VERSION, asOf, sources, note, sample);
	}

	private static Long total(List<Instrument> list) {
		if (list.stream().allMatch(i -> i.getMarketCap() == null)) {
			return null;
		}
		return list.stream().map(Instrument::getMarketCap).filter(Objects::nonNull).mapToLong(Long::longValue).sum();
	}

	/** 고를 수 있는 종목 = 어느 시장이든 시가총액 상위 topLimit 안(MarketService.find와 같은 기준). */
	private Instrument selectable(String code) {
		return instruments.findByCode(code)
			.filter(i -> i.getCapRank() != null && i.getCapRank() <= props.topLimit())
			.orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "고를 수 없는 종목이에요"));
	}

	private Range range(Instrument inst, PricePeriod period) {
		LocalDate asOf = prices.findLatestTradeDate(inst.getId())
			.orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, inst.getName() + "의 시세를 아직 모으지 않았어요"));
		return new Range(asOf.minusMonths(period.months()), asOf);
	}

	private record Range(LocalDate from, LocalDate asOf) {
	}

	static boolean isSample(String source) {
		return source != null && source.startsWith(SAMPLE_SOURCE_PREFIX);
	}

	// ───────── 쓰기(worker) ─────────

	/** 같은 칸·날짜가 있으면 값을 고친다(정정 반영). 저장한 줄 수를 돌려준다. */
	@Transactional
	public int saveIndex(IndexKey key, List<IndexValue> values, String source) {
		if (values.isEmpty()) {
			return 0;
		}
		Instant now = clock.instant();
		LocalDate from = values.stream().map(IndexValue::date).min(LocalDate::compareTo).orElseThrow();
		LocalDate to = values.stream().map(IndexValue::date).max(LocalDate::compareTo).orElseThrow();
		Map<LocalDate, MarketIndexDaily> existing = new HashMap<>();
		indices.findByIndexKeyAndTradeDateBetween(key, from, to).forEach(m -> existing.put(m.getTradeDate(), m));
		List<MarketIndexDaily> save = new ArrayList<>();
		for (IndexValue v : values) {
			if (v.value() == null || v.value().signum() <= 0) {
				continue;
			}
			MarketIndexDaily m = existing.computeIfAbsent(v.date(), d -> new MarketIndexDaily(key, d));
			m.set(v.value().setScale(key.scale(), RoundingMode.DOWN), source, now);
			save.add(m);
		}
		indices.saveAll(save);
		return save.size();
	}

	@Transactional(readOnly = true)
	public Optional<LocalDate> latestIndexDate(IndexKey key) {
		return indices.findLatestTradeDate(key);
	}
}
