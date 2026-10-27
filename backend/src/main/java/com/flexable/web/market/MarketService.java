package com.flexable.web.market;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;

import com.flexable.web.market.MarketDtos.BoardListing;
import com.flexable.web.market.MarketDtos.InstrumentRow;
import com.flexable.web.market.MarketDtos.InstrumentView;

/**
 * 종목·일봉 저장소의 공개 창구. 읽기는 api(화면·simulation), 쓰기는 worker(ingest)가 쓴다.
 * 외부 API는 부르지 않는다(04 §8: 외부 호출은 worker만).
 */
@Service
public class MarketService {

	private final InstrumentRepository instruments;
	private final DailyPriceRepository prices;
	private final MarketProperties props;
	private final Clock clock;

	public MarketService(InstrumentRepository instruments, DailyPriceRepository prices, MarketProperties props, Clock clock) {
		this.instruments = instruments;
		this.prices = prices;
		this.props = props;
		this.clock = clock;
	}

	// ───────── 읽기(api) ─────────

	@Transactional(readOnly = true)
	public BoardListing board(Board board) {
		List<Instrument> rows = instruments.findByBoardAndCapRankNotNullOrderByCapRankAsc(board).stream()
			.limit(props.topLimit())
			.toList();
		if (rows.isEmpty()) {
			return new BoardListing(board, List.of(), null, null, null);
		}
		Instrument first = rows.getFirst();
		return new BoardListing(board, rows.stream().map(MarketService::view).toList(), first.getSource(), first.getSourceNote(), first.getDataAsOf());
	}

	/** 고를 수 있는 종목 = 어느 시장이든 시가총액 상위 topLimit 안. */
	@Transactional(readOnly = true)
	public Optional<InstrumentView> find(String code) {
		return instruments.findByCode(code)
			.filter(i -> i.getCapRank() != null && i.getCapRank() <= props.topLimit())
			.map(MarketService::view);
	}

	/** from(포함)부터 저장된 일봉, 날짜 오름차순. 없으면 빈 목록. */
	@Transactional(readOnly = true)
	public List<DailyClose> dailyCloses(String code, LocalDate from) {
		return instruments.findByCode(code)
			.map(i -> prices.findByInstrumentIdAndTradeDateGreaterThanEqualOrderByTradeDateAsc(i.getId(), from).stream()
				.map(p -> new DailyClose(p.getTradeDate(), p.getClose()))
				.toList())
			.orElse(List.of());
	}

	/** 계산에 쓴 종목들의 시세·종목 정보 출처(화면 출처 표시용). */
	@Transactional(readOnly = true)
	public Sources sources(List<String> codes) {
		Set<String> priceSources = new java.util.LinkedHashSet<>();
		Set<String> instrumentSources = new java.util.LinkedHashSet<>();
		for (Instrument i : instruments.findByCodeIn(codes)) {
			instrumentSources.add(i.getSource());
			prices.findLatestTradeDate(i.getId())
				.flatMap(d -> prices.findById(new DailyPrice.Key(i.getId(), d)))
				.ifPresent(p -> priceSources.add(p.getSource()));
		}
		return new Sources(List.copyOf(priceSources), List.copyOf(instrumentSources));
	}

	public record Sources(List<String> prices, List<String> instruments) {
	}

	@Transactional(readOnly = true)
	public Optional<LocalDate> earliestTradeDate(String code) {
		return instruments.findByCode(code).flatMap(i -> prices.findEarliestTradeDate(i.getId()));
	}

	@Transactional(readOnly = true)
	public MarketDtos.StatusResponse status() {
		List<Instrument> ranked = instruments.findByCapRankNotNull();
		LocalDate asOf = prices.findLatestTradeDate().orElse(null);
		LocalDate listed = ranked.stream().map(Instrument::getDataAsOf).max(LocalDate::compareTo).orElse(null);
		return new MarketDtos.StatusResponse(asOf, listed, ranked.size(), asOf == null);
	}

	// ───────── 쓰기(worker) ─────────

	/** 한 시장의 상위 목록을 바꾼다. rows는 시가총액 내림차순. 목록에서 빠진 종목은 순위만 지우고 시세는 남긴다. */
	@Transactional
	public int replaceBoard(Board board, List<InstrumentRow> rows, String source, String note, LocalDate asOf) {
		var now = clock.instant();
		Map<String, Instrument> existing = new HashMap<>();
		instruments.findByCodeIn(rows.stream().map(InstrumentRow::code).toList()).forEach(i -> existing.put(i.getCode(), i));
		Set<String> kept = new HashSet<>();
		List<Instrument> save = new ArrayList<>();
		int rank = 0;
		for (InstrumentRow r : rows) {
			if (!kept.add(r.code())) {
				continue;
			}
			Instrument i = existing.getOrDefault(r.code(), new Instrument(r.code()));
			i.update(r, board, ++rank, source, note, asOf, now);
			save.add(i);
		}
		for (Instrument i : instruments.findByBoardAndCapRankNotNullOrderByCapRankAsc(board)) {
			if (!kept.contains(i.getCode())) {
				i.dropRank(now);
				save.add(i);
			}
		}
		instruments.saveAll(save);
		return rank;
	}

	/** 시세를 모을 종목 코드(모든 시장의 상위 목록), 시장별 순위가 높은 것부터 번갈아. */
	@Transactional(readOnly = true)
	public List<String> rankedCodes() {
		List<List<Instrument>> byBoard = new ArrayList<>();
		for (Board b : Board.values()) {
			byBoard.add(instruments.findByBoardAndCapRankNotNullOrderByCapRankAsc(b).stream().limit(props.topLimit()).toList());
		}
		List<String> out = new ArrayList<>();
		for (int r = 0; byBoard.stream().anyMatch(l -> !l.isEmpty()); r++) {
			boolean any = false;
			for (List<Instrument> l : byBoard) {
				if (r < l.size()) {
					out.add(l.get(r).getCode());
					any = true;
				}
			}
			if (!any) {
				break;
			}
		}
		return out;
	}

	@Transactional(readOnly = true)
	public Optional<LocalDate> latestTradeDate(String code) {
		return instruments.findByCode(code).flatMap(i -> prices.findLatestTradeDate(i.getId()));
	}

	/** 같은 종목·거래일이 있으면 값을 고친다(정정 반영). 저장한 줄 수를 돌려준다. */
	@Transactional
	public int saveDailyCloses(String code, List<DailyClose> closes, Map<LocalDate, Long> volumes, String source) {
		Instrument i = instruments.findByCode(code).orElseThrow(() -> new IllegalArgumentException("모르는 종목: " + code));
		if (closes.isEmpty()) {
			return 0;
		}
		var now = clock.instant();
		LocalDate from = closes.stream().map(DailyClose::date).min(LocalDate::compareTo).orElseThrow();
		LocalDate to = closes.stream().map(DailyClose::date).max(LocalDate::compareTo).orElseThrow();
		Map<LocalDate, DailyPrice> existing = new HashMap<>();
		prices.findByInstrumentIdAndTradeDateBetween(i.getId(), from, to).forEach(p -> existing.put(p.getTradeDate(), p));
		List<DailyPrice> save = new ArrayList<>();
		for (DailyClose c : closes) {
			DailyPrice p = existing.computeIfAbsent(c.date(), d -> new DailyPrice(i.getId(), d));
			p.set(c.close(), volumes.get(c.date()), source, now);
			save.add(p);
		}
		prices.saveAll(save);
		return save.size();
	}

	/** OpenDART 고유번호를 아직 모르는 종목 코드(상위 목록 안 STOCK). ETF는 공시 주체가 아니라 뺀다. */
	@Transactional(readOnly = true)
	public List<String> stockCodesWithoutCorpCode() {
		return instruments.findByCapRankNotNull().stream()
			.filter(i -> "STOCK".equals(i.getKind()) && i.getCorpCode() == null)
			.map(Instrument::getCode)
			.toList();
	}

	/** 종목코드 → OpenDART 고유번호. 맵에 있는 종목만 바꾸고 바꾼 수를 돌려준다. */
	@Transactional
	public int setCorpCodes(Map<String, String> corpCodes) {
		List<Instrument> found = instruments.findByCodeIn(List.copyOf(corpCodes.keySet()));
		int n = 0;
		for (Instrument i : found) {
			String c = corpCodes.get(i.getCode());
			if (c != null && !c.equals(i.getCorpCode())) {
				i.setCorpCode(c);
				n++;
			}
		}
		instruments.saveAll(found);
		return n;
	}

	/**
	 * 종목코드 → 업종명(키움 upName). KIWOOM_UPNAME_V1 규칙(PracticeMarketService.categoryName)으로 정리하고, 빈 값은 저장하지 않는다.
	 * 맵에 없는 종목은 마지막 값을 둔다. 바꾼 수를 돌려준다.
	 */
	@Transactional
	public int setIndustries(Map<String, String> industries, LocalDate asOf) {
		List<Instrument> found = instruments.findByCodeIn(List.copyOf(industries.keySet()));
		int n = 0;
		for (Instrument i : found) {
			String name = PracticeMarketService.categoryName(industries.get(i.getCode()));
			if (name.isEmpty()) {
				continue;
			}
			i.setIndustry(name, asOf);
			n++;
		}
		instruments.saveAll(found);
		return n;
	}

	private static InstrumentView view(Instrument i) {
		return new InstrumentView(i.getCode(), i.getName(), i.getMarket(), i.getKind(), i.getBoard(), i.getCapRank(), i.getMarketCap());
	}
}
