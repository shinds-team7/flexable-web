package com.flexable.web.ingest.krx;

import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.Board;
import com.flexable.web.ingest.InstrumentInfo;
import com.flexable.web.ingest.InstrumentListing;
import com.flexable.web.ingest.InstrumentSource;

/**
 * KRX 정보데이터시스템 Open API 일별매매정보(코스피·코스닥·ETF)로 종목 이름·시장·시가총액(MKTCAP)을 받는다.
 * 전날 자료가 다음 영업일 아침에 올라오므로 어제부터 하루씩 거슬러 최대 7일까지 찾는다. 시장별로 하루 동안 메모리에 둔다.
 * API마다 KRX에서 따로 이용 신청을 해야 한다. 승인 안 된 API는 예외(401)를 던지고, 대체 소스가 있으면 그쪽을 쓴다.
 */
public class KrxInstrumentSource implements InstrumentSource {

	private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final Map<Board, String> PATHS = Map.of(
			Board.KOSPI, "/sto/stk_bydd_trd",
			Board.KOSDAQ, "/sto/ksq_bydd_trd",
			Board.ETF, "/etp/etf_bydd_trd");

	private record Cached(LocalDate on, InstrumentListing listing) {
	}

	private final RestClient http;
	private final String baseUrl;
	private final String authKey;
	private final Clock clock;
	private final ZoneId zone;
	private final Map<Board, Cached> cache = new EnumMap<>(Board.class);

	public KrxInstrumentSource(RestClient http, String baseUrl, String authKey, Clock clock, ZoneId zone) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.authKey = authKey;
		this.clock = clock;
		this.zone = zone;
	}

	@Override
	public String source() {
		return "KRX 정보데이터시스템 Open API";
	}

	@Override
	public synchronized InstrumentListing listing(Board board) {
		LocalDate today = LocalDate.now(clock.withZone(zone));
		Cached c = cache.get(board);
		if (c != null && c.on().equals(today)) {
			return c.listing();
		}
		if (authKey == null || authKey.isBlank()) {
			throw new IllegalStateException("KRX_AUTH_KEY가 비어 있어요(backend/.env)");
		}
		List<InstrumentInfo> out = new ArrayList<>();
		for (Object o : latestRows(PATHS.get(board), today)) {
			if (o instanceof Map<?, ?> row && row.get("ISU_CD") instanceof String code && row.get("ISU_NM") instanceof String name) {
				String market = row.get("MKT_NM") instanceof String m && !m.isBlank() ? m : board == Board.ETF ? null : board.name();
				out.add(new InstrumentInfo(code.trim(), name.trim(), market, board == Board.ETF ? "ETF" : "STOCK", number(row.get("MKTCAP"))));
			}
		}
		InstrumentListing l = new InstrumentListing(List.copyOf(out), source(), null);
		if (!out.isEmpty()) {
			cache.put(board, new Cached(today, l));
		}
		return l;
	}

	private List<?> latestRows(String path, LocalDate today) {
		for (int back = 1; back <= 7; back++) {
			String basDd = today.minusDays(back).format(YMD);
			Map<String, Object> res = http.get()
				.uri(baseUrl + path + "?basDd=" + basDd)
				.header("AUTH_KEY", authKey)
				.retrieve()
				.body(MAP);
			if (res != null && res.get("OutBlock_1") instanceof List<?> rows && !rows.isEmpty()) {
				return rows;
			}
		}
		return List.of();
	}

	static Long number(Object v) {
		if (v == null) {
			return null;
		}
		String s = String.valueOf(v).replace(",", "").trim();
		try {
			return s.isEmpty() || "-".equals(s) ? null : Long.parseLong(s);
		}
		catch (NumberFormatException e) {
			return null;
		}
	}
}
