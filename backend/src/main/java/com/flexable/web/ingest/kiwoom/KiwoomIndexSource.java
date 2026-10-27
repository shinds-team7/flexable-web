package com.flexable.web.ingest.kiwoom;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.IndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/**
 * 키움 REST 업종일봉조회(ka20006). inds_cd 001=코스피 종합, 101=코스닥 종합. base_dt부터 과거로 한 페이지를 받는다(시장 띠는 최근 값만 쓴다).
 * 공식 가이드 기준으로 가격 필드는 지수×100 정수 문자열이다. 인증된 실제 응답은 서버 키로 따로 확인한다(decisions/2026-10-26-invest-insight-redesign ⑤).
 */
public class KiwoomIndexSource implements IndexSource {

	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final Map<IndexKey, String> CODES = Map.of(IndexKey.KOSPI, "001", IndexKey.KOSDAQ, "101");

	private final RestClient http;
	private final String baseUrl;
	private final KiwoomTokenClient tokens;

	public KiwoomIndexSource(RestClient http, String baseUrl, KiwoomTokenClient tokens) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.tokens = tokens;
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
	public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
		String code = CODES.get(key);
		if (code == null) {
			throw new IllegalArgumentException("키움 업종일봉으로 받을 수 없는 칸: " + key);
		}
		Map<String, Object> body = http.post()
			.uri(baseUrl + "/api/dostk/chart")
			.contentType(KiwoomTokenClient.JSON_UTF8)
			.headers(h -> {
				h.setBearerAuth(tokens.token());
				h.set("api-id", "ka20006");
			})
			.body(Map.of("inds_cd", code, "base_dt", to.format(YMD)))
			.retrieve()
			.body(KiwoomTokenClient.MAP);
		KiwoomPriceSource.checkReturnCode(body);
		List<IndexValue> out = new ArrayList<>();
		if (body.get("inds_dt_pole_qry") instanceof List<?> rows) {
			for (Object o : rows) {
				if (!(o instanceof Map<?, ?> row) || !(row.get("dt") instanceof String dt) || dt.isBlank()) {
					continue;
				}
				LocalDate d = LocalDate.parse(dt, YMD);
				if (d.isBefore(from) || d.isAfter(to)) {
					continue;
				}
				out.add(new IndexValue(d, BigDecimal.valueOf(KiwoomPriceSource.price(row.get("cur_prc")), 2)));
			}
		}
		return out;
	}
}
