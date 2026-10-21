package com.flexable.web.simulation;

import java.math.BigDecimal;
import java.math.RoundingMode;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.stereotype.Service;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.EventDtos;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketDtos.InstrumentView;
import com.flexable.web.market.MarketService;
import com.flexable.web.simulation.SimulationDtos.EventItem;
import com.flexable.web.simulation.SimulationDtos.Funding;
import com.flexable.web.simulation.SimulationDtos.LegInfo;
import com.flexable.web.simulation.SimulationDtos.ResolvedInput;
import com.flexable.web.simulation.SimulationDtos.RunRequest;
import com.flexable.web.simulation.SimulationDtos.RunResponse;
import com.flexable.web.simulation.SimulationDtos.Source;
import com.flexable.web.simulation.SimulationEngine.LegInput;
import com.flexable.web.simulation.SimulationEngine.Mode;

/** 입력 검증 → 시세 조회(market) → 계산(SimulationEngine) → 응답. 계산은 서버만 한다(ADR-3). */
@Service
public class SimulationService {

	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

	/** 03 §8-3 고지 상수 SIM_PAST. */
	static final String NOTICE = "과거 시세로 계산한 가상의 결과예요. 앞으로의 수익을 뜻하지 않고 투자 권유가 아니에요. 실제 투자는 원금 손실이 생길 수 있어요.";
	static final List<String> ASSUMPTIONS = List.of(
			"주마다 그 주 마지막 거래일 종가로 평가해요.",
			"매달 첫 거래일 종가로 샀다고 가정해요(소수점 매수).",
			"배당 재투자·세금·수수료는 빠져 있어요.");

	private final MarketService market;
	private final EventService events;
	private final Clock clock;

	public SimulationService(MarketService market, EventService events, Clock clock) {
		this.market = market;
		this.events = events;
		this.clock = clock;
	}

	public RunResponse run(RunRequest req) {
		Funding f = req.funding();
		long total = 0;
		long monthly = 0;
		// 매달 나눠서(SPLIT)·지금 저축 속도로(PACE) 모두 정한 금액을 매달 넣는다. 둘은 금액 출처만 다르다(화면).
		if (f.mode() != Mode.LUMP_SUM) {
			monthly = range("funding.monthlyAmount", f.monthlyAmount(), SimulationDtos.MIN_MONTHLY, SimulationDtos.MAX_MONTHLY);
		}
		else {
			total = range("funding.totalAmount", f.totalAmount(), SimulationDtos.MIN_TOTAL, SimulationDtos.MAX_TOTAL);
		}

		var start = req.startDate().withDayOfMonth(1);
		var today = LocalDate.now(clock.withZone(SEOUL));
		if (start.isAfter(today)) {
			throw ApiException.invalid("startDate", "시작 시점은 오늘보다 앞이어야 해요");
		}
		if (start.isBefore(today.minusYears(10).withDayOfMonth(1))) {
			throw ApiException.invalid("startDate", "시작 시점은 10년 전까지 고를 수 있어요");
		}

		Set<String> seen = new HashSet<>();
		Map<String, InstrumentView> info = new HashMap<>();
		for (var leg : req.legs()) {
			if (!seen.add(leg.instrumentId())) {
				throw ApiException.invalid("legs", "같은 종목을 두 번 고를 수 없어요");
			}
			var found = market.find(leg.instrumentId())
				.orElseThrow(() -> ApiException.invalid("legs", "고를 수 없는 종목이에요: " + leg.instrumentId()));
			info.put(found.id(), found);
		}
		List<BigDecimal> weights = weights(req.legs());

		List<LegInput> legs = new ArrayList<>();
		for (int j = 0; j < req.legs().size(); j++) {
			String id = req.legs().get(j).instrumentId();
			// 첫 주가 비었을 때 이어 쓸 직전 종가가 필요해서 1주 앞부터 읽는다. 시세는 worker가 모아 둔 것만 쓴다.
			List<DailyClose> closes = market.dailyCloses(id, start.minusDays(7));
			if (closes.isEmpty()) {
				throw new ApiException(ErrorCode.MARKET_UNAVAILABLE, info.get(id).name() + "의 시세를 아직 모으지 않았어요", Map.of("field", id));
			}
			if (closes.stream().noneMatch(d -> !d.date().isAfter(start.plusDays(10)))) {
				throw ApiException.invalid("startDate", info.get(id).name() + "은(는) " + closes.getFirst().date() + "부터 시세가 있어요. 시작 시점을 늦춰 주세요");
			}
			legs.add(new LegInput(id, weights.get(j), closes));
		}

		SimulationEngine.Input input = new SimulationEngine.Input(start, f.mode(), total, monthly, legs);
		SimulationEngine.Result r;
		try {
			r = SimulationEngine.run(input);
		}
		catch (IllegalArgumentException e) {
			throw ApiException.invalid("startDate", e.getMessage());
		}

		List<LegInfo> legInfo = new ArrayList<>();
		for (int j = 0; j < legs.size(); j++) {
			var i = info.get(legs.get(j).id());
			var lr = r.legs().get(j);
			legInfo.add(new LegInfo(lr.id(), i.name(), i.kind(), weights.get(j), lr.invested(), lr.finalValue()));
		}
		var src = market.sources(legs.stream().map(LegInput::id).toList());
		List<Source> sources = List.of(
				new Source(String.join("·", src.prices()), "일봉 종가"),
				new Source(String.join("·", src.instruments()), "종목 이름·시장"));
		return new RunResponse(new ResolvedInput(r.startDate(), r.endDate(), f.mode()), r.contributionCount(),
				r.monthlyAmount(), r.totalInvested(), r.finalValue(), r.profit(), r.returnRate(), SimulationEngine.VERSION,
				r.endDate(), "WEEK_LAST_CLOSE", legInfo, r.series(), events(input, r, info), ASSUMPTIONS, "SIM_PAST", NOTICE, sources);
	}

	/** 기간 안 사건과 사건 전후 내 돈(03 C-9). 시장 사건은 조합 전체, 종목 사건은 그 종목 평가액으로 잰다. */
	private List<EventItem> events(SimulationEngine.Input in, SimulationEngine.Result r, Map<String, InstrumentView> info) {
		List<String> codes = in.legs().stream().map(LegInput::id).toList();
		List<EventItem> out = new ArrayList<>();
		for (EventDtos.EventView e : events.eventsBetween(codes, r.startDate(), r.endDate())) {
			boolean marketWide = "MARKET".equals(e.scope());
			Integer leg = marketWide ? null : codes.indexOf(e.code());
			SimulationEngine.Holding before = SimulationEngine.holdingAt(in, r, leg, e.startDate().minusDays(1));
			SimulationEngine.Holding after = SimulationEngine.holdingAt(in, r, leg, e.endDate());
			boolean held = before.invested() > 0;
			long added = after.invested() - before.invested();
			String name = marketWide ? null : info.get(e.code()).name();
			var top = e.sources().isEmpty() ? null : e.sources().getFirst();
			out.add(new EventItem(e.id(), marketWide ? null : e.code(), e.scope(), e.startDate(), e.endDate(), e.windowDays(), e.direction(),
					e.returnRate(), e.marketReturn(), EventDtos.headline(name, e.scope(), e.direction(), e.windowDays()), false,
					top == null ? null : "DART 공시", e.sources().size(), top == null ? null : top.title(), e.score(),
					held ? before.value() : null, held ? after.value() : null, held ? added : null,
					held ? after.value() - before.value() - added : null, EventDtos.NOTICE_KEY));
		}
		return out;
	}

	private static long range(String field, Long v, long min, long max) {
		if (v == null || v < min || v > max) {
			throw ApiException.invalid(field, String.format("금액은 %,d원 ~ %,d원 사이로 넣어 주세요", min, max));
		}
		return v;
	}

	/** 모두 비우면 균등(4자리 내림, 나머지는 첫 종목). 하나라도 넣었으면 모두 넣고 합이 1이어야 한다. */
	static List<BigDecimal> weights(List<SimulationDtos.Leg> legs) {
		boolean none = legs.stream().allMatch(l -> l.weight() == null);
		if (none) {
			BigDecimal each = BigDecimal.ONE.divide(BigDecimal.valueOf(legs.size()), 4, RoundingMode.DOWN);
			List<BigDecimal> out = new ArrayList<>(legs.stream().map(l -> each).toList());
			out.set(0, BigDecimal.ONE.subtract(each.multiply(BigDecimal.valueOf(legs.size() - 1))));
			return out;
		}
		BigDecimal sum = BigDecimal.ZERO;
		for (var l : legs) {
			if (l.weight() == null || l.weight().signum() <= 0) {
				throw ApiException.invalid("legs", "비율은 모든 종목에 0보다 크게 넣어 주세요");
			}
			sum = sum.add(l.weight());
		}
		if (sum.compareTo(BigDecimal.ONE) != 0) {
			throw ApiException.invalid("legs", "비율의 합이 100%가 되게 넣어 주세요");
		}
		return legs.stream().map(SimulationDtos.Leg::weight).toList();
	}
}
