package com.flexable.web.market;

import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.market.EventDtos.DetectResult;
import com.flexable.web.market.EventDtos.EventView;
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventDtos.PendingEvidence;

/**
 * 급변동 사건 저장소의 공개 창구. 탐지(EventDetector)는 DB에 모아 둔 일봉으로 하고, 근거(공시)는 worker(ingest)가 받아 넣는다.
 * 외부 API는 부르지 않는다(04 §8).
 */
@Service
public class EventService {

	static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	/** 사건 마지막 날 뒤 며칠까지는 늦게 올라오는 공시를 다시 찾아본다. */
	static final int EVIDENCE_RECHECK_DAYS = 3;

	private final InstrumentRepository instruments;
	private final DailyPriceRepository prices;
	private final MarketEventRepository events;
	private final EventSourceRepository sources;
	private final MarketProperties props;
	private final Clock clock;

	public EventService(InstrumentRepository instruments, DailyPriceRepository prices, MarketEventRepository events,
			EventSourceRepository sources, MarketProperties props, Clock clock) {
		this.instruments = instruments;
		this.prices = prices;
		this.events = events;
		this.sources = sources;
		this.props = props;
		this.clock = clock;
	}

	/** 시장 대용 종목 코드(시장 사건이 붙는 종목). */
	public String indexProxy() {
		return props.indexProxy();
	}

	/**
	 * 한 종목의 사건을 저장된 전체 일봉으로 다시 찾아 바꿔 넣는다. 시장 대용 종목이면 시장 사건(MARKET)을 찾는다.
	 * 같은 시작일이거나 기간이 겹치는 기존 사건은 갱신해 id·근거를 지키고, 다시 찾지 못한 사건은 지운다(근거도 함께).
	 */
	@Transactional
	public DetectResult detect(String code) {
		Optional<Instrument> found = instruments.findByCode(code);
		if (found.isEmpty()) {
			return new DetectResult(0, 0);
		}
		Instrument inst = found.get();
		List<EventDetector.Bar> bars = bars(inst.getId());
		boolean isProxy = code.equals(props.indexProxy());
		List<EventDetector.Detected> detected;
		if (isProxy) {
			detected = EventDetector.market(bars);
		}
		else {
			Map<LocalDate, Long> market = new HashMap<>();
			instruments.findByCode(props.indexProxy())
				.ifPresent(p -> bars(p.getId()).forEach(b -> market.put(b.date(), b.close())));
			detected = EventDetector.stock(bars, market, "ETF".equals(inst.getKind()));
		}
		return replace(inst.getId(), isProxy ? MarketEvent.MARKET : MarketEvent.STOCK, detected);
	}

	private DetectResult replace(long instrumentId, String scope, List<EventDetector.Detected> detected) {
		Instant now = clock.instant();
		List<MarketEvent> existing = new ArrayList<>(
				events.findByInstrumentIdAndScopeAndDetectorVersion(instrumentId, scope, EventDetector.VERSION));
		Set<MarketEvent> kept = new HashSet<>();
		List<MarketEvent> updated = new ArrayList<>();
		List<MarketEvent> created = new ArrayList<>();
		for (EventDetector.Detected d : detected) {
			MarketEvent e = existing.stream()
				.filter(x -> !kept.contains(x) && x.getStartDate().equals(d.start()))
				.findFirst()
				.or(() -> existing.stream().filter(x -> !kept.contains(x) && x.overlaps(d.start(), d.end())).findFirst())
				.orElse(null);
			if (e == null) {
				e = new MarketEvent(instrumentId, scope, EventDetector.VERSION);
				created.add(e);
			}
			else {
				updated.add(e);
			}
			e.apply(d, now);
			kept.add(e);
		}
		List<MarketEvent> gone = existing.stream().filter(x -> !kept.contains(x)).toList();
		// 시작일이 바뀐 사건이 다른 사건의 옛 시작일을 쓰면 UNIQUE에 걸리므로 지우기 → 갱신 → 새로 넣기 순서로 반영한다
		events.deleteAll(gone);
		events.flush();
		events.saveAll(updated);
		events.flush();
		events.saveAll(created);
		return new DetectResult(updated.size() + created.size(), gone.size());
	}

	private List<EventDetector.Bar> bars(long instrumentId) {
		return prices.findByInstrumentIdOrderByTradeDateAsc(instrumentId).stream()
			.map(p -> new EventDetector.Bar(p.getTradeDate(), p.getClose(), p.getVolume()))
			.toList();
	}

	/**
	 * 근거(공시)를 찾아야 할 종목 사건, 최근 사건부터 limit개. 아직 안 찾았거나, 마지막으로 찾은 때가 사건 마지막 날 + 3일보다 이르면 다시 찾는다.
	 * 조회 구간은 사건 시작 5거래일 전부터 마지막 날까지.
	 */
	@Transactional(readOnly = true)
	public List<PendingEvidence> pendingEvidence(int limit) {
		List<PendingEvidence> out = new ArrayList<>();
		for (Object[] row : events.findStockEventsWithCorpCode(EventDetector.VERSION)) {
			if (out.size() >= limit) {
				break;
			}
			MarketEvent e = (MarketEvent) row[0];
			Instant checked = e.getEvidenceCheckedAt();
			Instant settled = e.getEndDate().plusDays(EVIDENCE_RECHECK_DAYS + 1).atStartOfDay(SEOUL).toInstant();
			if (checked != null && !checked.isBefore(settled)) {
				continue;
			}
			List<DailyPrice> before = prices.findTop5ByInstrumentIdAndTradeDateLessThanOrderByTradeDateDesc(e.getInstrumentId(),
					e.getStartDate());
			LocalDate from = before.isEmpty() ? e.getStartDate().minusDays(7) : before.getLast().getTradeDate();
			String code = instruments.findById(e.getInstrumentId()).map(Instrument::getCode).orElse(null);
			out.add(new PendingEvidence(e.getId(), code, (String) row[1], from, e.getEndDate()));
		}
		return out;
	}

	/** 한 사건의 근거를 같은 type 것은 rows로 바꿔 넣고, 찾아본 시각을 남긴다(rows가 비어도). */
	@Transactional
	public void saveEvidence(long eventId, String type, List<EvidenceRow> rows) {
		MarketEvent e = events.findById(eventId).orElse(null);
		if (e == null) {
			return; // 그사이 다시 탐지돼 지워졌다
		}
		sources.deleteAll(sources.findByEventIdAndType(eventId, type));
		sources.flush();
		Set<String> seen = new HashSet<>();
		sources.saveAll(rows.stream().filter(r -> seen.add(r.externalId())).map(r -> new EventSource(eventId, r)).toList());
		e.evidenceChecked(clock.instant());
		events.save(e);
	}

	/**
	 * 시뮬레이션 기간(from~to)에 시작한 사건: 고른 종목들의 종목 사건 + 시장 사건(시장 대용 종목). 근거는 점수 순으로 붙인다.
	 * EventView.code는 종목 사건이면 그 종목, 시장 사건이면 시장 대용 종목 코드다.
	 */
	@Transactional(readOnly = true)
	public List<EventView> eventsBetween(List<String> codes, LocalDate from, LocalDate to) {
		Map<Long, String> codeOf = new HashMap<>();
		instruments.findByCodeIn(codes).forEach(i -> codeOf.put(i.getId(), i.getCode()));
		Optional<Instrument> proxy = instruments.findByCode(props.indexProxy());
		proxy.ifPresent(p -> codeOf.putIfAbsent(p.getId(), p.getCode()));
		if (codeOf.isEmpty()) {
			return List.of();
		}
		Long proxyId = proxy.map(Instrument::getId).orElse(null);
		Set<String> picked = Set.copyOf(codes);
		List<MarketEvent> list = events.findByInstrumentIdInAndDetectorVersionAndStartDateBetweenOrderByStartDateAsc(
				List.copyOf(codeOf.keySet()), EventDetector.VERSION, from, to).stream()
			// 시장 대용 종목을 직접 고르지 않았으면 그 종목의 종목 사건은 빼고 시장 사건만
			.filter(e -> MarketEvent.MARKET.equals(e.getScope()) || !e.getInstrumentId().equals(proxyId) || picked.contains(codeOf.get(proxyId)))
			.toList();
		return views(list, codeOf);
	}

	/** 사건 상세. 시장 반응·그 뒤에는(03 C-10)을 저장된 일봉으로 계산한다. */
	@Transactional(readOnly = true)
	public Optional<EventDtos.EventDetail> detail(long id) {
		Optional<MarketEvent> found = events.findById(id).filter(e -> EventDetector.VERSION.equals(e.getDetectorVersion()));
		if (found.isEmpty()) {
			return Optional.empty();
		}
		MarketEvent e = found.get();
		Instrument inst = instruments.findById(e.getInstrumentId()).orElseThrow();
		List<EvidenceRow> rows = sources.findByEventIdOrderByWeightDescPublishedDateDesc(id).stream().map(EventSource::row).toList();
		Double weekReturn = null;
		Optional<DailyPrice> last = prices.findById(new DailyPrice.Key(inst.getId(), e.getEndDate()));
		List<DailyPrice> before = prices.findTop5ByInstrumentIdAndTradeDateLessThanOrderByTradeDateDesc(inst.getId(), e.getEndDate());
		if (last.isPresent() && before.size() == 5) {
			weekReturn = (double) last.get().getClose() / before.getLast().getClose() - 1;
		}
		Double d30 = last.flatMap(l -> after(inst.getId(), e.getEndDate().plusDays(30), l.getClose())).orElse(null);
		Double d365 = last.flatMap(l -> after(inst.getId(), e.getEndDate().plusDays(365), l.getClose())).orElse(null);
		boolean market = MarketEvent.MARKET.equals(e.getScope());
		String name = market ? "시장 전체" : inst.getName();
		String query = java.net.URLEncoder.encode(market ? "코스피" : inst.getName(), java.nio.charset.StandardCharsets.UTF_8);
		java.time.format.DateTimeFormatter dot = java.time.format.DateTimeFormatter.ofPattern("yyyy.MM.dd");
		String news = "https://search.naver.com/search.naver?where=news&query=" + query + "&pd=3&ds=" + e.getStartDate().format(dot) + "&de="
				+ e.getEndDate().format(dot);
		return Optional.of(new EventDtos.EventDetail(e.getId(), market ? null : inst.getCode(), name, e.getScope(), e.getStartDate(),
				e.getEndDate(), e.getWindowDays(), e.getDirection(), EventDtos.headline(inst.getName(), e.getScope(), e.getDirection(), e.getWindowDays()),
				new EventDtos.MarketReaction(e.getReturnRate(), e.getMarketReturn(), e.getVolumeRatio(), weekReturn),
				new EventDtos.Afterwards(d30, d365), rows, news,
				EventDtos.whatHappened(name, e.getScope(), e.getStartDate(), e.getEndDate(), e.getWindowDays(), e.getReturnRate(),
						e.getMarketReturn(), rows.size()),
				List.of(), false,
				rows.isEmpty() ? "LOW" : "MEDIUM", EventDtos.NOTICE_KEY, EventDtos.NOTICE));
	}

	/** on(포함) 이후 첫 거래일 종가 ÷ base − 1. 아직 그 날 시세가 없으면 비어 있다. */
	private Optional<Double> after(long instrumentId, LocalDate on, long base) {
		return prices.findFirstByInstrumentIdAndTradeDateGreaterThanEqualOrderByTradeDateAsc(instrumentId, on)
			.map(p -> (double) p.getClose() / base - 1);
	}

	private List<EventView> views(List<MarketEvent> list, Map<Long, String> codeOf) {
		Map<Long, List<EvidenceRow>> bySource = new HashMap<>();
		sources.findByEventIdInOrderByWeightDescPublishedDateDesc(list.stream().map(MarketEvent::getId).toList())
			.forEach(s -> bySource.computeIfAbsent(s.getEventId(), k -> new ArrayList<>()).add(s.row()));
		return list.stream()
			.map(e -> new EventView(e.getId(), codeOf.get(e.getInstrumentId()), e.getScope(), e.getStartDate(), e.getEndDate(),
					e.getWindowDays(), e.getDirection(), e.getReturnRate(), e.getMarketReturn(), e.getScore(), e.getRankInYear(),
					bySource.getOrDefault(e.getId(), List.of())))
			.toList();
	}

	/** 한 종목에 저장된 사건(시장 대용 종목이면 시장 사건)과 근거, 시작일 순. */
	@Transactional(readOnly = true)
	public List<EventView> events(String code) {
		Optional<Instrument> found = instruments.findByCode(code);
		if (found.isEmpty()) {
			return List.of();
		}
		List<MarketEvent> list = events.findByInstrumentIdAndDetectorVersionOrderByStartDateAsc(found.get().getId(), EventDetector.VERSION);
		return views(list, Map.of(found.get().getId(), code));
	}
}
