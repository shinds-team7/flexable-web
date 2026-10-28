package com.flexable.web.ingest.kiwoom;

import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.springframework.http.ResponseEntity;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.DailyBar;
import com.flexable.web.ingest.PriceSource;

/**
 * 키움 REST 주식일봉차트조회(ka10081). 수정주가(upd_stkpc_tp=1)로 base_dt부터 과거로 받는다.
 * 응답이 최신 날짜부터 오므로 from보다 앞선 날짜가 나오거나 cont-yn이 N이 될 때까지 next-key로 이어 받는다.
 * ka10081은 초당 5건 한도라, 페이지뿐 아니라 종목이 바뀌어도 모든 호출 사이를 pageDelay만큼 띄운다(시세·시뮬레이션 수집이 같은 인스턴스를 쓴다).
 */
public class KiwoomPriceSource implements PriceSource {

	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final int MAX_PAGES = 30;

	private final RestClient http;
	private final String baseUrl;
	private final KiwoomTokenClient tokens;
	private final Duration pageDelay;
	/** 마지막 ka10081 호출 시각(System.nanoTime). 0이면 아직 부르지 않음 */
	private long lastCall;

	public KiwoomPriceSource(RestClient http, String baseUrl, KiwoomTokenClient tokens, Duration pageDelay) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.tokens = tokens;
		this.pageDelay = pageDelay;
	}

	@Override
	public String source() {
		return "키움증권 REST API 주식일봉(수정주가)";
	}

	@Override
	public List<DailyBar> dailyBars(String code, LocalDate from, LocalDate to) {
		List<DailyBar> out = new ArrayList<>();
		String nextKey = null;
		for (int page = 0; page < MAX_PAGES; page++) {
			pace();
			String key = nextKey;
			ResponseEntity<Map<String, Object>> res = http.post()
				.uri(baseUrl + "/api/dostk/chart")
				.contentType(KiwoomTokenClient.JSON_UTF8)
				.headers(h -> {
					h.setBearerAuth(tokens.token());
					h.set("api-id", "ka10081");
					if (key != null) {
						h.set("cont-yn", "Y");
						h.set("next-key", key);
					}
				})
				.body(Map.of("stk_cd", code, "base_dt", to.format(YMD), "upd_stkpc_tp", "1"))
				.retrieve()
				.toEntity(KiwoomTokenClient.MAP);
			Map<String, Object> body = res.getBody();
			checkReturnCode(body);
			boolean reachedFrom = false;
			if (body.get("stk_dt_pole_chart_qry") instanceof List<?> rows) {
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
						out.add(new DailyBar(d, price(row.get("cur_prc")), volume(row.get("trde_qty")),
                                optionalPrice(row.get("open_pric")), optionalPrice(row.get("high_pric")), optionalPrice(row.get("low_pric"))));
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

	/** 키움 가격 문자열은 +·- 부호가 붙어 올 수 있다(전일 대비 방향). 종가는 절댓값이다. */
	static long price(Object v) {
		String s = String.valueOf(v).trim().replace(",", "");
		return Math.abs(Long.parseLong(s.startsWith("+") ? s.substring(1) : s));
	}

    static Long optionalPrice(Object v) {
        try { return v == null ? null : price(v); } catch (NumberFormatException e) { return null; }
    }
	static Long volume(Object v) {
		try {
			return v == null ? null : Math.abs(Long.parseLong(String.valueOf(v).trim().replace(",", "")));
		}
		catch (NumberFormatException e) {
			return null;
		}
	}

	static void checkReturnCode(Map<String, Object> body) {
		if (body == null) {
			throw new IllegalStateException("키움 응답이 비었어요");
		}
		Object rc = body.get("return_code");
		if (rc != null && !"0".equals(String.valueOf(rc))) {
			throw new IllegalStateException("키움 오류 " + rc + ": " + body.get("return_msg"));
		}
	}

	/** 직전 호출에서 pageDelay가 지나지 않았으면 남은 만큼 기다린다. */
	private synchronized void pace() {
		if (pageDelay.isZero()) {
			return;
		}
		long wait = lastCall == 0 ? 0 : lastCall + pageDelay.toNanos() - System.nanoTime();
		if (wait > 0) {
			try {
				Thread.sleep(Duration.ofNanos(wait));
			}
			catch (InterruptedException e) {
				Thread.currentThread().interrupt();
				throw new IllegalStateException("interrupted", e);
			}
		}
		lastCall = System.nanoTime();
	}
}
