package com.flexable.web.ingest.youthcenter;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.Arrays;
import java.util.LinkedHashMap;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.flexable.web.ingest.YouthPolicySource;
import com.flexable.web.news.NewsCategory;
import com.flexable.web.news.NewsDtos.PolicyDraft;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.json.JsonMapper;

/**
 * 온통청년(youthcenter.go.kr) 청년정책 오픈API. 목록을 페이지로 넘기며 받고, 한 건을 카드 초안(PolicyDraft)으로 바꾼다.
 * 응답 → 초안 변환은 toDraft 한 곳에만 둔다.
 * 요청 주소(go/ythip/getPlcy)·응답 필드 이름은 2026-10-21 실제 키로 받아 확인했다(3,472건). 코드 값의 뜻([미확인] 표시)은
 * 건수로 맞춰 본 것이라 공식 코드표로 다시 확인한다.
 * 인증키는 쿼리 파라미터라 오류 메시지에서 지우고 다시 던진다(로그·ingest_runs에 키가 남지 않게).
 * 원문에 담당자 이름(…PicNm)이 들어 있어 저장하기 전에 뺀다.
 */
public class YouthCenterPolicySource implements YouthPolicySource {

	public static final String SOURCE = "YOUTH_CENTER";
	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final int ATTEMPTS = 3;
	private static final Pattern RANGE = Pattern.compile("(\\d{8})\\s*~\\s*(\\d{8})");
	private static final Pattern ISO_DATE = Pattern.compile("^(\\d{4})-?(\\d{2})-?(\\d{2})");
	/** [미확인] 신청기간 구분 코드: 특정기간 · 상시 · 마감 */
	static final String APPLY_ALWAYS = "0057002";
	/** [미확인] 소득 조건 구분 코드: 무관 · 연소득 · 기타 */
	static final String INCOME_ANY = "0043001";
	static final String INCOME_ANNUAL = "0043002";

	private final RestClient http;
	private final String baseUrl;
	private final String apiKey;
	private final int pageSize;
	private final int maxPages;
	private final Duration callDelay;
	private final Clock clock;
	private final ZoneId zone;

	public YouthCenterPolicySource(RestClient http, String baseUrl, String apiKey, int pageSize, int maxPages, Duration callDelay,
			Clock clock, ZoneId zone) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
		this.pageSize = pageSize;
		this.maxPages = maxPages;
		this.callDelay = callDelay;
		this.clock = clock;
		this.zone = zone;
	}

	@Override
	public String source() {
		return SOURCE;
	}

	@Override
	public boolean enabled() {
		return apiKey != null && !apiKey.isBlank();
	}

	@Override
	public List<PolicyDraft> policies() {
		if (!enabled()) {
			throw new IllegalStateException("YOUTHCENTER_API_KEY가 비어 있어요");
		}
		LocalDate today = LocalDate.now(clock.withZone(zone));
		List<PolicyDraft> out = new ArrayList<>();
		for (int page = 1; page <= maxPages; page++) {
			if (page > 1) {
				pause();
			}
			Map<String, Object> res = page(page);
			Map<?, ?> result = res.get("result") instanceof Map<?, ?> m ? m : Map.of();
			List<?> rows = result.get("youthPolicyList") instanceof List<?> l ? l : List.of();
			for (Object o : rows) {
				if (o instanceof Map<?, ?> row) {
					PolicyDraft d = toDraft(row, today);
					if (d != null) {
						out.add(d);
					}
				}
			}
			int total = result.get("pagging") instanceof Map<?, ?> p ? toInt(p.get("totCount"), 0) : 0;
			if (rows.isEmpty() || page * pageSize >= total) {
				break;
			}
		}
		return out;
	}

	private Map<String, Object> page(int page) {
		String body = null;
		// 서버가 가끔 500을 주어 쪽마다 ATTEMPTS번까지 다시 부른다(적금 수집과 같은 처리)
		for (int attempt = 1;; attempt++) {
			try {
				// charset 없는 text/html로 올 수 있어 바이트로 받아 UTF-8(JSON 기본)로 읽는다
				byte[] bytes = http.get()
					.uri(baseUrl + "/go/ythip/getPlcy?apiKeyNm={key}&pageNum={page}&pageSize={size}&rtnType=json", apiKey, page, pageSize)
					.retrieve()
					.body(byte[].class);
				body = bytes == null ? null : new String(bytes, StandardCharsets.UTF_8);
				break;
			}
			catch (RestClientException e) {
				if (attempt >= ATTEMPTS) {
					throw hideKey("온통청년 호출 실패(" + page + "쪽, " + attempt + "번 시도): " + e.getMessage());
				}
				pause();
			}
		}
		Map<String, Object> res;
		try {
			@SuppressWarnings("unchecked")
			Map<String, Object> parsed = body == null ? null : JSON.readValue(body, Map.class);
			res = parsed;
		}
		catch (JacksonException e) {
			throw hideKey("온통청년 응답을 읽지 못했어요(JSON 아님): " + head(body));
		}
		if (res == null) {
			throw new IllegalStateException("온통청년: 빈 응답");
		}
		Object code = res.get("resultCode");
		if (code != null && toInt(code, -1) != 200) {
			throw hideKey("온통청년 " + code + ": " + res.get("resultMessage"));
		}
		return res;
	}

	/**
	 * 응답 한 건 → 카드 초안. 정책 번호·이름이 없으면 null(건너뜀). 원문에 없는 값은 null로 두고 만들어 내지 않는다.
	 * 필드: plcyNo 정책번호, plcyNm 정책명, lclsfNm·mclsfNm 대·중분류, sprtTrgtMinAge·sprtTrgtMaxAge 지원 나이,
	 * earnCndSeCd 소득 조건, zipCd 법정시군구코드(쉼표), aplyPrdSeCd·aplyYmd 신청기간, sprvsnInstCdNm 주관기관,
	 * aplyUrlAddr·refUrlAddr1 신청·참고 링크, plcyKywdNm 키워드, frstRegDt·lastMdfcnDt 등록·수정일
	 */
	static PolicyDraft toDraft(Map<?, ?> row, LocalDate today) {
		String id = text(row.get("plcyNo"));
		String title = text(row.get("plcyNm"));
		if (id == null || title == null) {
			return null;
		}
		LocalDate start = null;
		LocalDate deadline = null;
		String ymd = text(row.get("aplyYmd"));
		if (ymd != null) {
			Matcher m = RANGE.matcher(ymd);
			if (m.find()) {
				start = ymd(m.group(1));
				deadline = ymd(m.group(2));
			}
		}
		boolean always = APPLY_ALWAYS.equals(text(row.get("aplyPrdSeCd")));
		String income = text(row.get("earnCndSeCd"));
		Boolean incomeLimit = income == null ? null : INCOME_ANY.equals(income) ? Boolean.FALSE : INCOME_ANNUAL.equals(income) ? Boolean.TRUE : null;
		List<String> regions = Regions.fromZipCodes(text(row.get("zipCd")));
		boolean nationwide = regions != null && regions.size() == Regions.ALL.size();
		String url = firstUrl(text(row.get("aplyUrlAddr")), text(row.get("refUrlAddr1")));
		if (url == null) {
			// [미확인] 온통청년 정책 상세 화면 주소
			url = "https://www.youthcenter.go.kr/youthPolicy/ythPlcyTotalSearch/ythPlcyDetail/" + id;
		}
		LocalDate modified = date(text(row.get("lastMdfcnDt")));
		Map<Object, Object> kept = new LinkedHashMap<>();
		row.forEach((k, v) -> {
			if (!String.valueOf(k).endsWith("PicNm")) {
				kept.put(k, v);
			}
		});
		String payload;
		try {
			payload = JSON.writeValueAsString(kept);
		}
		catch (JacksonException e) {
			throw new IllegalStateException("원문을 저장하지 못했어요: " + id, e);
		}
		return new PolicyDraft(SOURCE, id, payload, title, categories(title, text(row.get("lclsfNm"))),
				age(row.get("sprtTrgtMinAge")), age(row.get("sprtTrgtMaxAge")), incomeLimit, nationwide, nationwide ? null : regions,
				start, deadline, always, text(row.get("sprvsnInstCdNm")), url, modified == null ? today : modified,
				date(text(row.get("frstRegDt"))), keywords(text(row.get("plcyKywdNm"))), date(text(row.get("bizPrdEndYmd"))));
	}

	/** 정책명에 이 낱말이 있으면 저축·금융. 온통청년 분류는 금융과 복지·문화가 한 칸이라(중분류 '취약계층 및 금융지원'에도 급식·의료비가 섞임) 분류만으로는 못 가른다. */
	static final List<String> FINANCE_WORDS = List.of("저축", "적금", "통장", "계좌", "자산", "재형", "대출", "이자", "이차보전", "금융", "신용", "공제",
			"영테크", "재테크", "경제교육", "생활경제", "금리", "투자", "채무", "부채", "정책자금");

	/**
	 * 온통청년 분류 → 소식 분야(여러 개, 앞이 대표). 대분류 이름에 든 낱말마다 분야를 붙인다:
	 * 일자리 → 일자리, 주거 → 주거, 교육 → 교육('교육･직업훈련' 포함), 문화('금융･복지･문화'·옛 '복지문화') → 생활·문화.
	 * 저축·금융은 분류가 아니라 정책명으로 정한다(FINANCE_WORDS). 그래서 '청년내일저축계좌'는 생활·문화와 저축·금융, '천원의 아침밥'은 생활·문화만.
	 * 대분류는 쉼표로 여러 개 올 수 있다(2026-10-21 확인). 어느 것에도 맞지 않으면(참여·기반, 참여권리) 빈 목록 → 기타(ETC)로 저장된다.
	 * 교통·세금은 온통청년 분류에 따로 없어 사람이 고른다.
	 */
	public static List<NewsCategory> categories(String title, String large) {
		String l = large == null ? "" : large;
		List<NewsCategory> out = new ArrayList<>();
		if (l.contains("일자리")) {
			out.add(NewsCategory.JOB);
		}
		if (l.contains("주거")) {
			out.add(NewsCategory.HOUSING);
		}
		if (title != null && FINANCE_WORDS.stream().anyMatch(title::contains)) {
			out.add(NewsCategory.FINANCE);
		}
		if (l.contains("교육")) {
			out.add(NewsCategory.EDUCATION);
		}
		if (l.contains("문화")) {
			out.add(NewsCategory.CULTURE);
		}
		return out;
	}

	private static List<String> keywords(String s) {
		if (s == null) {
			return List.of();
		}
		Set<String> out = new LinkedHashSet<>();
		Arrays.stream(s.split(",")).map(String::trim).filter(x -> !x.isEmpty()).forEach(out::add);
		return List.copyOf(out);
	}

	private static String firstUrl(String... urls) {
		for (String u : urls) {
			if (u != null && (u.startsWith("https://") || u.startsWith("http://"))) {
				return u;
			}
		}
		return null;
	}

	/** 0이나 빈 값은 원문에서 나이를 확인 못 한 것으로 본다. */
	private static Integer age(Object v) {
		int n = toInt(v, 0);
		return n > 0 && n < 120 ? n : null;
	}

	private static LocalDate ymd(String s) {
		try {
			return LocalDate.parse(s, YMD);
		}
		catch (DateTimeParseException e) {
			return null;
		}
	}

	/** "2025-03-01 10:00:00", "20250301" 같은 값의 날짜 부분. */
	private static LocalDate date(String s) {
		if (s == null) {
			return null;
		}
		Matcher m = ISO_DATE.matcher(s);
		return m.find() ? ymd(m.group(1) + m.group(2) + m.group(3)) : null;
	}

	private static String text(Object v) {
		if (v == null) {
			return null;
		}
		String s = String.valueOf(v).trim();
		return s.isEmpty() || "null".equalsIgnoreCase(s) ? null : s;
	}

	private static int toInt(Object v, int fallback) {
		if (v instanceof Number n) {
			return n.intValue();
		}
		try {
			return v == null ? fallback : Integer.parseInt(String.valueOf(v).trim());
		}
		catch (NumberFormatException e) {
			return fallback;
		}
	}

	private static String head(String s) {
		return s == null ? "" : s.substring(0, Math.min(120, s.length()));
	}

	private IllegalStateException hideKey(String msg) {
		return new IllegalStateException(enabled() ? msg.replace(apiKey, "***") : msg);
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
