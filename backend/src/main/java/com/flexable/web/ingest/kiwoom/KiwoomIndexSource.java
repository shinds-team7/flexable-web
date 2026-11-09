package com.flexable.web.ingest.kiwoom;

import java.math.BigDecimal;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.IndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/**
 * 키움 REST 업종일봉조회(ka20006). inds_cd 001=코스피 종합, 101=코스닥 종합. base_dt(to)부터 과거로 받고, from보다 앞선 날짜가 나오거나
 * cont-yn이 N이 될 때까지 next-key로 이어 받는다(공시 반응 측정용 5년치, Issue #371). 페이지 사이는 pageDelay만큼 띄운다.
 * 공식 가이드 기준으로 가격 필드는 지수×100 정수 문자열이다. 인증된 실제 응답은 서버 키로 따로 확인한다(decisions/2026-10-26-invest-insight-redesign ⑤).
 */
public class KiwoomIndexSource implements IndexSource {

	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final Map<IndexKey, String> CODES = Map.of(IndexKey.KOSPI, "001", IndexKey.KOSDAQ, "101");
	private static final int MAX_PAGES = 20;
	/** 공시 반응 측정이 쓰는 시세 기간(최근 5년 + 기준일 앞 여유) */
	static final int HISTORY_DAYS = 1900;

	private final RestClient http;
	private final String baseUrl;
	private final KiwoomTokenClient tokens;
	private final Duration pageDelay;

	public KiwoomIndexSource(RestClient http, String baseUrl, KiwoomTokenClient tokens, Duration pageDelay) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.tokens = tokens;
		this.pageDelay = pageDelay;
	}

	@Override
	public String source() {
		return "키움증권";
	}

	@Override
	public Set<IndexKey> keys() {
		return CODES.keySet();
	}

	@Override
	public int historyDays() {
		return HISTORY_DAYS;
	}

	@Override
	public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
		String code = CODES.get(key);
		if (code == null) {
			throw new IllegalArgumentException("키움 업종일봉으로 받을 수 없는 칸: " + key);
		}
		List<IndexValue> out = new ArrayList<>();
		String nextKey = null;
		for (int page = 0; page < MAX_PAGES; page++) {
			if (page > 0) {
				pause();
			}
			String next = nextKey;
			ResponseEntity<Map<String, Object>> res = http.post()
				.uri(baseUrl + "/api/dostk/chart")
				.contentType(KiwoomTokenClient.JSON_UTF8)
				.headers(h -> {
					h.setBearerAuth(tokens.token());
					h.set("api-id", "ka20006");
					if (next != null) {
						h.set("cont-yn", "Y");
						h.set("next-key", next);
					}
				})
				.body(Map.of("inds_cd", code, "base_dt", to.format(YMD)))
				.retrieve()
				.toEntity(KiwoomTokenClient.MAP);
			Map<String, Object> body = res.getBody();
			KiwoomPriceSource.checkReturnCode(body);
			boolean reachedFrom = false;
			if (body.get("inds_dt_pole_qry") instanceof List<?> rows) {
				for (Object o : rows) {
					if (!(o instanceof Map<?, ?> row) || !(row.get("dt") instanceof String dt) || dt.isBlank()) {
						continue;
					}
					LocalDate d = LocalDate.parse(dt, YMD);
					if (d.isBefore(from)) {
						reachedFrom = true;
						continue;
					}
					if (!d.isAfter(to)) {
						out.add(new IndexValue(d, BigDecimal.valueOf(KiwoomPriceSource.price(row.get("cur_prc")), 2)));
					}
				}
			}
			nextKey = res.getHeaders().getFirst("next-key");
			boolean more = "Y".equals(res.getHeaders().getFirst("cont-yn")) && nextKey != null && !nextKey.isBlank();
			if (reachedFrom || !more) {
				break;
			}
		}
		return out;
	}

	private void pause() {
		if (pageDelay.isZero()) {
			return;
		}
		try {
			Thread.sleep(pageDelay);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("interrupted", e);
		}
	}
}
