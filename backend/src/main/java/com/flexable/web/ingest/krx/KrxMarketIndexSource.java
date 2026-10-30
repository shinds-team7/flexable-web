package com.flexable.web.ingest.krx;

import java.math.BigDecimal;
import java.time.DayOfWeek;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.TreeSet;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.IndexSource;
import com.flexable.web.market.IndexKey;
import com.flexable.web.market.InsightDtos.IndexValue;

/**
 * 시장 띠의 KRX 칸(decisions/2026-10-26-invest-insight-redesign ⑤). basDd 하루를 부르면 그날 전체 목록이 오므로 날짜마다 한 번 부른다.
 * - KRXBOND: 지수 > 채권지수 시세정보(idx/bon_dd_trd). 지수 그룹(BND_IDX_GRP_NM)이 설정값과 같은 줄의 총수익지수(TOT_EARNG_IDX)
 * - GOLD: 일반상품 > 금시장 일별매매정보(gen/gold_bydd_trd). 종목 코드(ISU_CD)가 설정값과 같은 줄의 종가(TDD_CLSPRC, 원/g)
 * 기존 KRX 키를 헤더(AUTH_KEY)로 보내고, API마다 KRX에서 이용 신청이 필요하다. 휴장일은 빈 목록이 온다.
 * 목록은 있는데 고를 줄이 없으면 설정값이 틀린 것이라 실제 이름·코드를 메시지에 담아 실패시킨다(ingest_runs에서 확인).
 */
public class KrxMarketIndexSource implements IndexSource {

	private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;

	/** 칸마다 경로, 고를 열, 값 열. */
	private record Spec(String path, String matchField, String valueField) {
	}

	private static final Map<IndexKey, Spec> SPECS = Map.of(
			IndexKey.KRXBOND, new Spec("/idx/bon_dd_trd", "BND_IDX_GRP_NM", "TOT_EARNG_IDX"),
			IndexKey.GOLD, new Spec("/gen/gold_bydd_trd", "ISU_CD", "TDD_CLSPRC"));

	private final RestClient http;
	private final String baseUrl;
	private final String authKey;
	private final Map<IndexKey, String> match;
	private final Duration callDelay;

	public KrxMarketIndexSource(RestClient http, String baseUrl, String authKey, String bondIndexName, String goldIsuCd, Duration callDelay) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.authKey = authKey;
		this.match = Map.of(IndexKey.KRXBOND, bondIndexName, IndexKey.GOLD, goldIsuCd);
		this.callDelay = callDelay;
	}

	@Override
	public String source() {
		return "한국거래소";
	}

	/** 키가 없으면 받을 칸이 없다(그 칸은 띠에서 빠진다). */
	@Override
	public Set<IndexKey> keys() {
		return authKey == null || authKey.isBlank() ? Set.of() : SPECS.keySet();
	}

	@Override
	public List<IndexValue> daily(IndexKey key, LocalDate from, LocalDate to) {
		Spec spec = SPECS.get(key);
		if (spec == null) {
			throw new IllegalArgumentException("KRX로 받을 수 없는 칸: " + key);
		}
		List<IndexValue> out = new ArrayList<>();
		for (LocalDate d = from; !d.isAfter(to); d = d.plusDays(1)) {
			if (d.getDayOfWeek() == DayOfWeek.SATURDAY || d.getDayOfWeek() == DayOfWeek.SUNDAY) {
				continue;
			}
			pause();
			Map<String, Object> res = http.get()
				.uri(baseUrl + spec.path() + "?basDd=" + d.format(YMD))
				.header("AUTH_KEY", authKey)
				.retrieve()
				.body(MAP);
			BigDecimal v = pick(res, spec, match.get(key));
			if (v != null) {
				out.add(new IndexValue(d, v));
			}
		}
		return out;
	}

	/** 그날 목록에서 고를 줄의 값. 목록이 비면(휴장일) null, 값이 결측이면 null. 목록은 있는데 고를 줄이 없으면 예외. */
	private static BigDecimal pick(Map<String, Object> res, Spec spec, String wanted) {
		if (res == null || !(res.get("OutBlock_1") instanceof List<?> rows) || rows.isEmpty()) {
			return null;
		}
		Set<String> seen = new TreeSet<>();
		for (Object o : rows) {
			if (o instanceof Map<?, ?> row && row.get(spec.matchField()) instanceof String name) {
				if (name.trim().equals(wanted)) {
					return decimal(row.get(spec.valueField()));
				}
				seen.add(name.trim());
			}
		}
		throw new IllegalStateException(spec.matchField() + "=" + wanted + " 줄이 없어요. 있는 값: " + String.join(", ", seen));
	}

	/** "1,234.56" → 1234.56. 빈 값·"-"·0 이하·숫자 아님은 결측(null). */
	static BigDecimal decimal(Object v) {
		String s = v == null ? "" : String.valueOf(v).replace(",", "").trim();
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
