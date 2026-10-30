package com.flexable.web.ingest.koreaexim;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.flexable.web.ingest.IndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * 한국수출입은행 현재환율 API(AP01). searchdate 하루를 부르면 그날 고시한 모든 통화가 한 번에 온다. 값은 매매기준율(deal_bas_r, "1,385.5" 같은 쉼표 문자열).
 * 주말·공휴일과 그날 고시 전에는 빈 배열이 온다. result: 1 성공, 2 DATA 코드 오류, 3 인증코드 오류, 4 일일 제한 횟수 마감.
 * 인증키가 쿼리 파라미터라 오류 메시지에서 지우고 다시 던진다(로그·ingest_runs에 키가 남지 않게).
 * 통화마다 같은 날짜를 다시 부르지 않도록 지난 날짜의 응답은 메모리에 둔다(그날 값은 고시 회차에 따라 바뀔 수 있어 두지 않는다).
 */
public class KoreaEximFxSource implements IndexSource {

	static final Map<IndexKey, String> CURRENCIES = Map.of(IndexKey.USDKRW, "USD", IndexKey.JPYKRW, "JPY(100)", IndexKey.EURKRW, "EUR",
			IndexKey.CNYKRW, "CNH");
	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final int CACHE_DAYS = 60;

	private final RestClient http;
	private final String baseUrl;
	private final String authKey;
	private final Duration callDelay;
	private final Map<LocalDate, Map<String, BigDecimal>> cache = new HashMap<>();

	public KoreaEximFxSource(RestClient http, String baseUrl, String authKey, Duration callDelay) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.authKey = authKey;
		this.callDelay = callDelay;
	}

	@Override
	public String source() {
		return "한국수출입은행";
	}

	/** 키가 없으면 받을 칸이 없다(그 칸은 띠에서 빠진다). */
	@Override
	public Set<IndexKey> keys() {
		return authKey == null || authKey.isBlank() ? Set.of() : CURRENCIES.keySet();
	}

	@Override
	public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
		String code = CURRENCIES.get(key);
		if (code == null) {
			throw new IllegalArgumentException("수출입은행 환율로 받을 수 없는 칸: " + key);
		}
		List<IndexValue> out = new ArrayList<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
				continue;
			}
			BigDecimal rate = rates(d, to).get(code);
			if (rate != null) {
				out.add(new IndexValue(d, rate));
			}
		}
		return out;
	}

	private synchronized Map<String, BigDecimal> rates(LocalDate d, LocalDate today) {
		Map<String, BigDecimal> cached = cache.get(d);
		if (cached != null) {
			return cached;
		}
		Map<String, BigDecimal> got = parse(fetch(d));
		if (!got.isEmpty() && d.isBefore(today)) {
			cache.keySet().removeIf(k -> k.isBefore(today.minusDays(CACHE_DAYS)));
			cache.put(d, got);
		}
		return got;
	}

	private String fetch(LocalDate d) {
		pause();
		try {
			return http.get()
				.uri(baseUrl + "?authkey={key}&searchdate={date}&data=AP01", authKey, d.format(YMD))
				.retrieve()
				.body(String.class);
		}
		catch (RestClientException e) {
			throw new IllegalStateException("수출입은행 환율 호출 실패: " + String.valueOf(e.getMessage()).replace(authKey, "***"));
		}
	}

	/** 통화 코드 → 매매기준율. 빈 배열(휴일·고시 전)이면 빈 맵. 키·한도 오류는 예외로 알린다. */
	static Map<String, BigDecimal> parse(String body) {
		if (body == null || body.isBlank()) {
			return Map.of();
		}
		JsonNode root;
		try {
			root = JSON.readTree(body);
		}
		catch (JacksonException e) {
			throw new IllegalStateException("수출입은행 환율 응답이 JSON이 아니에요");
		}
		if (!root.isArray()) {
			throw new IllegalStateException("수출입은행 환율 응답이 목록이 아니에요");
		}
		Map<String, BigDecimal> out = new HashMap<>();
		for (JsonNode row : root) {
			int result = row.path("result").asInt(1);
			switch (result) {
				case 2 -> throw new IllegalStateException("수출입은행 환율 요청 코드 오류(result=2)");
				case 3 -> throw new IllegalStateException("수출입은행 인증키 오류(result=3)");
				case 4 -> throw new IllegalStateException("수출입은행 하루 호출 한도 마감(result=4)");
				default -> {
				}
			}
			String code = row.path("cur_unit").asString("").trim();
			BigDecimal rate = decimal(row.path("deal_bas_r").asString(""));
			if (result == 1 && !code.isEmpty() && rate != null) {
				out.put(code, rate);
			}
		}
		return out;
	}

	/** "1,385.5" → 1385.5. 빈 값·"-"·0 이하·숫자 아님은 결측(null). */
	static BigDecimal decimal(String v) {
		String s = v == null ? "" : v.replace(",", "").trim();
		if (s.isEmpty() || "-".equals(s)) {
			return null;
		}
		try {
			BigDecimal b = new BigDecimal(s);
			return b.signum() > 0 ? b : null;
		}
		catch (NumberFormatException e) {
			return null;
		}
	}

	private void pause() {
		if (callDelay.isZero() || callDelay.isNegative()) {
			return;
		}
		try {
			Thread.sleep(callDelay);
		}
		catch (InterruptedException e) {
			Thread.currentThread().interrupt();
			throw new IllegalStateException("중단됨", e);
		}
	}
}
