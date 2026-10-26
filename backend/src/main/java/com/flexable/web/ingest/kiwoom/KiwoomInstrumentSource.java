package com.flexable.web.ingest.kiwoom;

import java.math.BigInteger;
import java.time.Clock;
import java.time.LocalDate;
import java.time.ZoneId;
import java.util.ArrayList;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.Board;
import com.flexable.web.ingest.InstrumentInfo;
import com.flexable.web.ingest.InstrumentListing;
import com.flexable.web.ingest.InstrumentSource;

/**
 * 키움 REST 종목정보 리스트(ka10099). mrkt_tp 0=코스피, 10=코스닥, 8=ETF.
 * 시가총액은 응답에 없어 상장주식수(listCount) × 전일 종가(lastPrice)로 어림한다. 시장별로 하루 동안 메모리에 둔다.
 */
public class KiwoomInstrumentSource implements InstrumentSource {

	private static final Map<Board, String> MARKET_TYPE = Map.of(Board.KOSPI, "0", Board.KOSDAQ, "10", Board.ETF, "8");
	private static final int MAX_PAGES = 10;

	private record Cached(LocalDate on, InstrumentListing listing) {
	}

	private final RestClient http;
	private final String baseUrl;
	private final KiwoomTokenClient tokens;
	private final Clock clock;
	private final ZoneId zone;
	private final Map<Board, Cached> cache = new EnumMap<>(Board.class);

	public KiwoomInstrumentSource(RestClient http, String baseUrl, KiwoomTokenClient tokens, Clock clock, ZoneId zone) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.tokens = tokens;
		this.clock = clock;
		this.zone = zone;
	}

	@Override
	public String source() {
		return "키움증권 REST API 종목정보";
	}

	@Override
	public synchronized InstrumentListing listing(Board board) {
		LocalDate today = LocalDate.now(clock.withZone(zone));
		Cached c = cache.get(board);
		if (c != null && c.on().equals(today)) {
			return c.listing();
		}
		List<InstrumentInfo> out = new ArrayList<>();
		String nextKey = null;
		for (int page = 0; page < MAX_PAGES; page++) {
			String key = nextKey;
			ResponseEntity<Map<String, Object>> res = http.post()
				.uri(baseUrl + "/api/dostk/stkinfo")
				.contentType(KiwoomTokenClient.JSON_UTF8)
				.headers(h -> {
					h.setBearerAuth(tokens.token());
					h.set("api-id", "ka10099");
					if (key != null) {
						h.set("cont-yn", "Y");
						h.set("next-key", key);
					}
				})
				.body(Map.of("mrkt_tp", MARKET_TYPE.get(board)))
				.retrieve()
				.toEntity(KiwoomTokenClient.MAP);
			Map<String, Object> body = res.getBody();
			KiwoomPriceSource.checkReturnCode(body);
			if (body.get("list") instanceof List<?> rows) {
				for (Object o : rows) {
					if (o instanceof Map<?, ?> row && row.get("code") instanceof String code && row.get("name") instanceof String name) {
						out.add(new InstrumentInfo(code.trim(), name.trim(), board == Board.ETF ? null : board.name(),
								board == Board.ETF ? "ETF" : "STOCK", cap(row.get("listCount"), row.get("lastPrice")),
                                row.get("upName") instanceof String industry ? industry : null));
					}
				}
			}
			nextKey = res.getHeaders().getFirst("next-key");
			if (!"Y".equals(res.getHeaders().getFirst("cont-yn")) || nextKey == null || nextKey.isBlank()) {
				break;
			}
		}
		InstrumentListing l = new InstrumentListing(List.copyOf(out), source(), null);
		if (!out.isEmpty()) {
			cache.put(board, new Cached(today, l));
		}
		return l;
	}

	/** "0000000006350000" × "00008390" 같은 0 채운 문자열. 둘 중 하나라도 못 읽으면 null. */
	static Long cap(Object shares, Object price) {
		try {
			BigInteger v = new BigInteger(String.valueOf(shares).trim()).multiply(new BigInteger(String.valueOf(price).trim().replace("-", "").replace("+", "")));
			return v.bitLength() < 63 ? v.longValue() : Long.MAX_VALUE;
		}
		catch (NumberFormatException e) {
			return null;
		}
	}
}
