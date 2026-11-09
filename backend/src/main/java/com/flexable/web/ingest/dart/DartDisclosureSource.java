package com.flexable.web.ingest.dart;

import java.io.ByteArrayInputStream;
import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.HashSet;
import java.util.List;
import java.util.Locale;
import java.util.Map;
import java.util.Set;
import java.util.zip.ZipEntry;
import java.util.zip.ZipInputStream;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.HttpStatusCodeException;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.flexable.web.ingest.Disclosure;
import com.flexable.web.ingest.DisclosureSource;

/**
 * OpenDART(금융감독원 전자공시) Open API. 고유번호는 corpCode.xml(ZIP 안 XML), 공시 목록은 list.json(공시검색),
 * 배치고사 공시 주요 내용은 주요사항보고서 주요정보(DS005, piicDecsn.json 등), 배치고사 공시 AI 요약의 본문 글은 공시서류원본파일(document.xml)로 받는다.
 * 인증키는 쿼리 파라미터(crtfc_key)라 오류 메시지에서 지우고 다시 던진다(로그·ingest_runs에 키가 남지 않게).
 * 한도는 하루 20,000건이고 분당 1,000회를 넘으면 막힐 수 있어 호출마다 callDelay만큼 쉰다.
 */
public class DartDisclosureSource implements DisclosureSource {

	private static final ParameterizedTypeReference<Map<String, Object>> MAP = new ParameterizedTypeReference<>() { };
	private static final DateTimeFormatter YMD = DateTimeFormatter.BASIC_ISO_DATE;
	private static final int PAGE_COUNT = 100;
	private static final int MAX_PAGES = 5;
	/** 조회된 데이터가 없음 */
	static final String NO_DATA = "013";
	/** HTTP 429를 받은 경우의 상태 값(OpenDART 020 한도 초과와 같이 실행을 멈춘다) */
	static final String TOO_MANY_REQUESTS = "429";

	private final RestClient http;
	private final String baseUrl;
	private final String apiKey;
	private final Duration callDelay;

	public DartDisclosureSource(RestClient http, String baseUrl, String apiKey, Duration callDelay) {
		this.http = http;
		this.baseUrl = baseUrl;
		this.apiKey = apiKey;
		this.callDelay = callDelay;
	}

	@Override
	public boolean enabled() {
		return apiKey != null && !apiKey.isBlank();
	}

	@Override
	public String url(Disclosure d) {
		return "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=" + d.receiptNo();
	}

	@Override
	public Map<String, String> corpCodes() {
		try (ZipInputStream zip = corpCodeXml()) {
			return parseCorpCodes(zip);
		}
		catch (IOException | XMLStreamException e) {
			throw new IllegalStateException("DART corpCode.xml을 읽지 못했어요: " + e.getMessage(), e);
		}
	}

	/** corpCode.xml에서 종목코드가 있는 회사(상장사)의 이름. 가상 회사 글 검사(REAL_COMPANY)에 쓴다 */
	@Override
	public Set<String> listedNames() {
		try (ZipInputStream zip = corpCodeXml()) {
			return parseListedNames(zip);
		}
		catch (IOException | XMLStreamException e) {
			throw new IllegalStateException("DART corpCode.xml을 읽지 못했어요: " + e.getMessage(), e);
		}
	}

	/** corpCode.xml ZIP을 받아 첫 항목 위치로 연다 */
	private ZipInputStream corpCodeXml() throws IOException {
		byte[] body;
		try {
			body = http.get().uri(baseUrl + "/api/corpCode.xml?crtfc_key={key}", apiKey).retrieve().body(byte[].class);
		}
		catch (RestClientException e) {
			throw hideKey(e);
		}
		if (body == null || body.length < 2 || body[0] != 'P' || body[1] != 'K') {
			// 오류면 ZIP 대신 <result><status>…</status><message>…</message></result>가 온다
			String text = body == null ? "" : new String(body, StandardCharsets.UTF_8);
			throw new DartException(tag(text, "status"), tag(text, "message"));
		}
		ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(body), StandardCharsets.UTF_8);
		if (zip.getNextEntry() == null) {
			zip.close();
			throw new IllegalStateException("DART corpCode.xml: ZIP이 비어 있어요");
		}
		return zip;
	}

	/** <list><corp_name>…</corp_name><stock_code>…</stock_code></list> 중 종목코드가 있는 회사 이름 */
	static Set<String> parseListedNames(InputStream xml) throws XMLStreamException {
		XMLStreamReader r = reader(xml);
		Set<String> out = new HashSet<>();
		String name = null;
		String stock = null;
		while (r.hasNext()) {
			int ev = r.next();
			if (ev == XMLStreamConstants.START_ELEMENT) {
				switch (r.getLocalName()) {
					case "list" -> {
						name = null;
						stock = null;
					}
					case "corp_name" -> name = r.getElementText().trim();
					case "stock_code" -> stock = r.getElementText().trim();
					default -> {
					}
				}
			}
			else if (ev == XMLStreamConstants.END_ELEMENT && "list".equals(r.getLocalName()) && name != null && !name.isEmpty() && stock != null
					&& !stock.isEmpty()) {
				out.add(name);
			}
		}
		r.close();
		return out;
	}

	private static XMLStreamReader reader(InputStream xml) throws XMLStreamException {
		XMLInputFactory f = XMLInputFactory.newFactory();
		f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
		f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
		return f.createXMLStreamReader(xml);
	}

	/** <list><corp_code>…</corp_code><stock_code>…</stock_code></list> 중 종목코드가 있는 것만. */
	static Map<String, String> parseCorpCodes(InputStream xml) throws XMLStreamException {
		XMLStreamReader r = reader(xml);
		Map<String, String> out = new HashMap<>();
		String corp = null;
		String stock = null;
		while (r.hasNext()) {
			int ev = r.next();
			if (ev == XMLStreamConstants.START_ELEMENT) {
				switch (r.getLocalName()) {
					case "list" -> {
						corp = null;
						stock = null;
					}
					case "corp_code" -> corp = r.getElementText().trim();
					case "stock_code" -> stock = r.getElementText().trim();
					default -> {
					}
				}
			}
			else if (ev == XMLStreamConstants.END_ELEMENT && "list".equals(r.getLocalName()) && corp != null && stock != null
					&& !stock.isEmpty()) {
				out.put(stock, corp);
			}
		}
		r.close();
		return out;
	}

	@Override
	public List<Disclosure> disclosures(String corpCode, LocalDate from, LocalDate to) {
		List<Disclosure> out = new ArrayList<>();
		for (int page = 1; page <= MAX_PAGES; page++) {
			Page p = page(corpCode, from, to, page);
			out.addAll(p.items());
			if (page >= p.totalPages()) {
				break;
			}
		}
		return out;
	}

	/** list.json 한 쪽(100건). 조회된 데이터가 없으면(013) 빈 쪽·전체 0쪽 */
	@Override
	public Page page(String corpCode, LocalDate from, LocalDate to, int page) {
		pause();
		Map<String, Object> res;
		try {
			res = http.get()
				.uri(baseUrl + "/api/list.json?crtfc_key={key}&corp_code={corp}&bgn_de={from}&end_de={to}&page_no={page}&page_count={count}", apiKey,
						corpCode, from.format(YMD), to.format(YMD), page, PAGE_COUNT)
				.retrieve()
				.body(MAP);
		}
		catch (RestClientException e) {
			throw hideKey(e);
		}
		if (res == null) {
			throw new DartException(null, "빈 응답");
		}
		String status = String.valueOf(res.get("status"));
		if (NO_DATA.equals(status)) {
			return new Page(List.of(), 0);
		}
		if (!"000".equals(status)) {
			throw new DartException(status, String.valueOf(res.get("message")));
		}
		List<Disclosure> out = new ArrayList<>();
		if (res.get("list") instanceof List<?> rows) {
			for (Object o : rows) {
				if (o instanceof Map<?, ?> row && row.get("rcept_no") instanceof String no && row.get("report_nm") instanceof String name
						&& row.get("rcept_dt") instanceof String dt) {
					String filer = row.get("flr_nm") instanceof String s && !s.isBlank() ? s.trim() : null;
					out.add(new Disclosure(no.trim(), name.trim(), filer, LocalDate.parse(dt.trim(), YMD)));
				}
			}
		}
		return new Page(out, res.get("total_page") instanceof Number n ? n.intValue() : 1);
	}

	/**
	 * 주요사항보고서 주요정보(DS005) 한 번 호출. 값은 글자 그대로 두고(숫자는 "1,234" 꼴), 자료 없음은 013만 빈 목록이다.
	 * 000인데 list가 없거나 비었거나, 행이 객체가 아니거나 접수번호가 14자리 숫자가 아니면 응답 형식 오류로 예외를 던진다(빈 결과로 저장해 재수집을 막지 않게)
	 */
	@Override
	public List<Map<String, String>> majorReport(String api, String corpCode, LocalDate from, LocalDate to) {
		if (api == null || !api.matches("[A-Za-z]+")) {
			throw new IllegalArgumentException("DS005 API 이름이 아니에요: " + api);
		}
		pause();
		Map<String, Object> res;
		try {
			res = http.get()
				.uri(baseUrl + "/api/" + api + ".json?crtfc_key={key}&corp_code={corp}&bgn_de={from}&end_de={to}", apiKey, corpCode, from.format(YMD),
						to.format(YMD))
				.retrieve()
				.body(MAP);
		}
		catch (RestClientException e) {
			throw hideKey(e);
		}
		if (res == null) {
			throw new DartException(null, "빈 응답");
		}
		String status = String.valueOf(res.get("status"));
		if (NO_DATA.equals(status)) {
			return List.of();
		}
		if (!"000".equals(status)) {
			throw new DartException(status, String.valueOf(res.get("message")));
		}
		if (!(res.get("list") instanceof List<?> rows) || rows.isEmpty()) {
			throw new IllegalStateException("DS005 " + api + " 응답 형식 오류: 정상(000)인데 list가 없어요");
		}
		List<Map<String, String>> out = new ArrayList<>();
		for (Object o : rows) {
			if (!(o instanceof Map<?, ?> row) || !(row.get("rcept_no") instanceof String no) || !no.trim().matches("\\d{14}")) {
				throw new IllegalStateException("DS005 " + api + " 응답 형식 오류: 접수번호가 없거나 잘못된 행이 있어요");
			}
			Map<String, String> m = new HashMap<>();
			row.forEach((k, v) -> {
				if (k instanceof String key && v != null) {
					m.put(key, String.valueOf(v).trim());
				}
			});
			out.add(m);
		}
		return out;
	}

	/** 공시서류원본파일 ZIP에서 읽을 크기 상한(공시 하나). 넘는 뒤쪽은 버린다 */
	static final int MAX_DOCUMENT_BYTES = 4 * 1024 * 1024;
	/** 원문 파일이 없음 */
	static final String NO_FILE = "014";

	/**
	 * 공시서류원본파일(document.xml) 한 번 호출. ZIP 안의 본문 파일(접수번호.xml, 없으면 첫 XML)을 읽어 bodyText로 글만 남긴다.
	 * 오류면 ZIP 대신 <result><status>…</status></result>가 온다. 자료 없음(013)·파일 없음(014)은 null, 그 밖은 DartException
	 */
	@Override
	public String documentText(String receiptNo) {
		if (receiptNo == null || !receiptNo.matches("\\d{14}")) {
			throw new IllegalArgumentException("접수번호가 아니에요: " + receiptNo);
		}
		pause();
		byte[] body;
		try {
			body = http.get().uri(baseUrl + "/api/document.xml?crtfc_key={key}&rcept_no={no}", apiKey, receiptNo).retrieve().body(byte[].class);
		}
		catch (RestClientException e) {
			throw hideKey(e);
		}
		if (body == null || body.length < 2 || body[0] != 'P' || body[1] != 'K') {
			String text = body == null ? "" : new String(body, StandardCharsets.UTF_8);
			String status = tag(text, "status");
			if (NO_DATA.equals(status) || NO_FILE.equals(status)) {
				return null;
			}
			throw new DartException(status, tag(text, "message"));
		}
		try {
			byte[] xml = mainEntry(body, receiptNo);
			return xml == null ? null : bodyText(decode(xml));
		}
		catch (IOException e) {
			throw new IllegalStateException("DART 공시서류원본파일을 읽지 못했어요: " + e.getMessage(), e);
		}
	}

	/** ZIP에서 접수번호.xml(없으면 첫 .xml) 바이트. XML이 없으면 null */
	static byte[] mainEntry(byte[] zipBytes, String receiptNo) throws IOException {
		byte[] first = null;
		try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes), StandardCharsets.UTF_8)) {
			ZipEntry e;
			while ((e = zip.getNextEntry()) != null) {
				String name = e.getName().toLowerCase(Locale.ROOT);
				if (!name.endsWith(".xml")) {
					continue;
				}
				byte[] bytes = zip.readNBytes(MAX_DOCUMENT_BYTES);
				if (name.equals(receiptNo + ".xml")) {
					return bytes;
				}
				if (first == null) {
					first = bytes;
				}
			}
		}
		catch (IllegalArgumentException e) {
			// 항목 이름이 UTF-8이 아니면(오래된 ZIP) 이름을 볼 수 없다. 첫 항목만 다시 읽는다
			try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(zipBytes), java.nio.charset.Charset.forName("MS949"))) {
				return zip.getNextEntry() == null ? null : zip.readNBytes(MAX_DOCUMENT_BYTES);
			}
		}
		return first;
	}

	/** XML 선언의 encoding(없으면 UTF-8)으로 읽는다. 모르는 인코딩이면 UTF-8 */
	static String decode(byte[] xml) {
		String head = new String(xml, 0, Math.min(xml.length, 200), StandardCharsets.ISO_8859_1);
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("encoding=[\"']([A-Za-z0-9_\\-]+)[\"']").matcher(head);
		java.nio.charset.Charset cs = StandardCharsets.UTF_8;
		if (m.find()) {
			try {
				String name = m.group(1).equalsIgnoreCase("euc-kr") ? "MS949" : m.group(1);
				cs = java.nio.charset.Charset.forName(name);
			}
			catch (RuntimeException e) {
				cs = StandardCharsets.UTF_8;
			}
		}
		return new String(xml, cs);
	}

	/** 본문 글에서 빼는 요소: 표지(대표이사 이름·주소·전화번호), 회사 이름·문서 이름, 요약 정보, 그림 */
	private static final List<String> DROP = List.of("COVER", "COMPANY-NAME", "DOCUMENT-NAME", "FORMULA-VERSION", "SUMMARY", "IMAGE", "IMG", "LIBRARY-INFO");

	/**
	 * DART 공시서류 XML → 본문 글. DROP 요소를 빼고, 표 칸(TD·TH·TE·TU)은 " | "로, 줄(TR)·문단(P)·제목은 줄바꿈으로 바꾼 뒤 태그를 지운다.
	 * 엔터티를 풀고 줄마다 공백을 고르며 빈 줄은 버린다
	 */
	public static String bodyText(String xml) {
		String s = xml;
		for (String tag : DROP) {
			s = dropElement(s, tag);
		}
		s = s.replaceAll("(?i)</(TD|TH|TE|TU)\\s*>", " | ");
		s = s.replaceAll("(?i)</(TR|P|TITLE|TABLE|SECTION-\\d+|PGBRK)\\s*>|(?i)<(BR|PGBRK)\\b[^>]*/?>", "\n");
		s = s.replaceAll("<[^>]*>", " ");
		s = unescape(s);
		StringBuilder out = new StringBuilder();
		for (String line : s.split("\n")) {
			String t = line.replace('\u00a0', ' ').replaceAll("[ \t\r\f]+", " ").replaceAll("(\\s*\\|\\s*)+$", "").replaceAll("^(\\s*\\|\\s*)+", "").strip();
			if (!t.isEmpty() && !t.matches("[|\\s-]+")) {
				out.append(t).append('\n');
			}
		}
		return out.toString().strip();
	}

	/** <TAG …>…</TAG>를 모두 지운다(대문자 태그, 정규식 되추적 없이). 닫는 태그가 없으면 여는 태그부터 끝까지 지운다. 스스로 닫는 태그(<TAG/>)는 태그만 지운다 */
	static String dropElement(String s, String tag) {
		StringBuilder out = new StringBuilder();
		String open = "<" + tag, close = "</" + tag + ">";
		int from = 0;
		while (true) {
			int a = s.indexOf(open, from);
			while (a >= 0 && a + open.length() < s.length() && !isTagEnd(s.charAt(a + open.length()))) {
				a = s.indexOf(open, a + 1);
			}
			if (a < 0) {
				out.append(s, from, s.length());
				return out.toString();
			}
			out.append(s, from, a).append(' ');
			int gt = s.indexOf('>', a);
			if (gt > 0 && s.charAt(gt - 1) == '/') {
				from = gt + 1;
				continue;
			}
			int b = s.indexOf(close, a);
			if (b < 0) {
				return out.toString();
			}
			from = b + close.length();
		}
	}

	private static boolean isTagEnd(char c) {
		return c == '>' || c == '/' || Character.isWhitespace(c);
	}

	private static String unescape(String s) {
		java.util.regex.Matcher m = java.util.regex.Pattern.compile("&(#x[0-9a-fA-F]+|#\\d+|amp|lt|gt|quot|apos|nbsp);").matcher(s);
		StringBuilder out = new StringBuilder();
		while (m.find()) {
			String e = m.group(1);
			String r = switch (e) {
				case "amp" -> "&";
				case "lt" -> "<";
				case "gt" -> ">";
				case "quot" -> "\"";
				case "apos" -> "'";
				case "nbsp" -> " ";
				default -> {
					try {
						int cp = e.startsWith("#x") ? Integer.parseInt(e.substring(2), 16) : Integer.parseInt(e.substring(1));
						yield Character.isValidCodePoint(cp) ? new String(Character.toChars(cp)) : " ";
					}
					catch (NumberFormatException ex) {
						yield " ";
					}
				}
			};
			m.appendReplacement(out, java.util.regex.Matcher.quoteReplacement(r));
		}
		m.appendTail(out);
		return out.toString();
	}

	/** HTTP 429(요청 한도 초과)는 JSON 020과 같이 실행을 멈추는 DartException으로, 그 밖은 키를 가린 IllegalStateException으로 바꾼다 */
	private RuntimeException hideKey(RestClientException e) {
		if (e instanceof HttpStatusCodeException h && h.getStatusCode().value() == 429) {
			return new DartException(TOO_MANY_REQUESTS, "요청 한도 초과(HTTP 429)");
		}
		String msg = String.valueOf(e.getMessage());
		if (enabled()) {
			msg = msg.replace(apiKey, "***");
		}
		return new IllegalStateException("DART 호출 실패: " + msg);
	}

	private static String tag(String xml, String name) {
		int a = xml.indexOf("<" + name + ">");
		int b = xml.indexOf("</" + name + ">");
		return a < 0 || b < a ? null : xml.substring(a + name.length() + 2, b).trim();
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

	/** DART가 돌려준 오류 상태. 020(요청 제한 초과)·010·011·012(키 문제)면 이번 실행의 공시 단계를 멈춘다. */
	public static class DartException extends RuntimeException {

		private final String status;

		public DartException(String status, String message) {
			super("DART " + status + ": " + message);
			this.status = status;
		}

		public String status() {
			return status;
		}

		/** 다음 호출도 같은 이유로 실패할 오류인지(키 문제·한도 초과). */
		public boolean stopsRun() {
			return status != null && List.of("010", "011", "012", "020", "901", TOO_MANY_REQUESTS).contains(status);
		}
	}
}
