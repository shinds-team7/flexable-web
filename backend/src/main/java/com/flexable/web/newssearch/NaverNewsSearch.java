package com.flexable.web.newssearch;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.time.format.DateTimeParseException;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.regex.Matcher;
import java.util.regex.Pattern;

import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.flexable.web.market.NewsSearch;

import tools.jackson.core.JacksonException;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/**
 * NAVER API HUB 뉴스 검색(GET /search/v1/news). 헤더 X-NCP-APIGW-API-KEY-ID·X-NCP-APIGW-API-KEY에 키를 넣는다.
 * 날짜 범위 조건이 없어 query·display(100)·sort만 보낸다. 결과는 저장·캐시하지 않는다(검색 API 특약 2.3).
 * 제목은 검색어 강조 태그와 HTML 엔티티만 풀고, 요약(description)은 쓰지 않는다. 오류 메시지에는 상태·오류 코드만 남긴다(키·본문 없음).
 */
public class NaverNewsSearch implements NewsSearch {

	static final String PATH = "/search/v1/news";
	static final int DISPLAY = 100;
	private static final JsonMapper JSON = JsonMapper.builder().build();
	private static final Pattern TAG = Pattern.compile("<[^>]*>");
	private static final Pattern ENTITY = Pattern.compile("&(#[0-9]+|#[xX][0-9a-fA-F]+|[a-zA-Z]+);");
	private static final Map<String, String> NAMED = Map.of("amp", "&", "lt", "<", "gt", ">", "quot", "\"", "apos", "'", "nbsp", " ",
			"middot", "·", "hellip", "…", "lsquo", "‘", "rsquo", "’");

	private final RestClient http;
	private final NewsSearchProperties props;

	public NaverNewsSearch(RestClient.Builder builder, NewsSearchProperties props) {
		this.props = props;
		this.http = builder.baseUrl(props.baseUrl().replaceAll("/+$", ""))
			.defaultHeader("X-NCP-APIGW-API-KEY-ID", props.keyId() == null ? "" : props.keyId())
			.defaultHeader("X-NCP-APIGW-API-KEY", props.key() == null ? "" : props.key())
			.build();
	}

	@Override
	public boolean enabled() {
		return props.configured();
	}

	@Override
	public boolean sample() {
		return false;
	}

	@Override
	public List<Article> search(String query, Sort sort, LocalDate from, LocalDate to) {
		if (!enabled()) {
			throw new Unavailable("NAVER 키 없음", false);
		}
		Response res;
		try {
			res = http.get()
				.uri(u -> u.path(PATH).queryParam("query", query).queryParam("display", DISPLAY).queryParam("start", 1)
					.queryParam("sort", sort == Sort.DATE ? "date" : "sim").build())
				.exchange((req, r) -> new Response(r.getStatusCode().value(), new String(r.getBody().readAllBytes(), StandardCharsets.UTF_8)));
		}
		catch (RestClientException e) {
			throw new Unavailable("NAVER 호출 실패: " + e.getClass().getSimpleName(), false);
		}
		if (res == null) {
			throw new Unavailable("NAVER 빈 응답", false);
		}
		if (res.status() != 200) {
			throw error(res.status(), res.body());
		}
		return parse(res.body());
	}

	private record Response(int status, String body) {
	}

	/**
	 * 오류 응답을 분류한다. 검색 API 오류는 {errorCode, errorMessage}(SE01~SE06·SE99), 게이트웨이 오류는 {error:{errorCode,…}}.
	 * 401·403(키 문제)·429(하루 한도)는 그날 다시 불러도 같으므로 stopsToday.
	 */
	static Unavailable error(int status, String body) {
		String code = null;
		try {
			JsonNode root = JSON.readTree(body == null ? "" : body);
			if (root != null && root.path("errorCode").isString()) {
				code = root.path("errorCode").asString();
			}
			else if (root != null && root.path("error").path("errorCode").isString()) {
				code = root.path("error").path("errorCode").asString();
			}
		}
		catch (JacksonException e) {
			// 본문이 JSON이 아니면 상태 코드만 쓴다
		}
		boolean stops = status == 401 || status == 403 || status == 429;
		return new Unavailable("NAVER " + status + (code == null ? "" : " " + code.replaceAll("[^A-Za-z0-9_]", "")), stops);
	}

	/** 성공 응답의 items. 제목·링크·발행 시각이 없거나 링크가 http(s)가 아니면 뺀다. */
	static List<Article> parse(String body) {
		JsonNode root;
		try {
			root = JSON.readTree(body);
		}
		catch (JacksonException e) {
			throw new Unavailable("NAVER 응답을 읽지 못했어요", false);
		}
		List<Article> out = new ArrayList<>();
		for (JsonNode item : root.path("items")) {
			String title = cleanTitle(item.path("title").asString(""));
			String original = item.path("originallink").asString("").trim();
			String link = item.path("link").asString("").trim();
			String url = web(original) ? original : web(link) ? link : null;
			OffsetDateTime at = pubDate(item.path("pubDate").asString(""));
			if (title.isEmpty() || url == null || at == null) {
				continue;
			}
			out.add(new Article(title, url, web(original) ? host(original) : null, at));
		}
		return out;
	}

	/** <b>…</b> 같은 태그를 빼고 HTML 엔티티를 푼다. 그 밖의 글자는 그대로 둔다. */
	static String cleanTitle(String raw) {
		String noTags = TAG.matcher(raw).replaceAll("");
		Matcher m = ENTITY.matcher(noTags);
		StringBuilder sb = new StringBuilder();
		while (m.find()) {
			m.appendReplacement(sb, Matcher.quoteReplacement(entity(m.group(1), m.group())));
		}
		m.appendTail(sb);
		return sb.toString().trim();
	}

	private static String entity(String name, String whole) {
		try {
			if (name.startsWith("#x") || name.startsWith("#X")) {
				return new String(Character.toChars(Integer.parseInt(name.substring(2), 16)));
			}
			if (name.startsWith("#")) {
				return new String(Character.toChars(Integer.parseInt(name.substring(1))));
			}
		}
		catch (IllegalArgumentException e) {
			return whole;
		}
		return NAMED.getOrDefault(name, whole);
	}

	/** RFC 1123 형식(예: Mon, 26 Sep 2016 07:50:00 +0900). 못 읽으면 null. */
	static OffsetDateTime pubDate(String raw) {
		try {
			return OffsetDateTime.parse(raw.trim(), DateTimeFormatter.RFC_1123_DATE_TIME);
		}
		catch (DateTimeParseException e) {
			return null;
		}
	}

	private static boolean web(String url) {
		if (url == null || url.isEmpty()) {
			return false;
		}
		try {
			URI u = URI.create(url);
			return ("https".equalsIgnoreCase(u.getScheme()) || "http".equalsIgnoreCase(u.getScheme())) && u.getHost() != null;
		}
		catch (IllegalArgumentException e) {
			return false;
		}
	}

	private static String host(String url) {
		return URI.create(url).getHost().toLowerCase();
	}
}
