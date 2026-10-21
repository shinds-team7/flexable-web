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
import java.util.List;
import java.util.Map;
import java.util.zip.ZipInputStream;

import javax.xml.stream.XMLInputFactory;
import javax.xml.stream.XMLStreamConstants;
import javax.xml.stream.XMLStreamException;
import javax.xml.stream.XMLStreamReader;

import org.springframework.core.ParameterizedTypeReference;
import org.springframework.web.client.RestClient;
import org.springframework.web.client.RestClientException;

import com.flexable.web.ingest.Disclosure;
import com.flexable.web.ingest.DisclosureSource;

/**
 * OpenDART(금융감독원 전자공시) Open API. 고유번호는 corpCode.xml(ZIP 안 XML), 공시 목록은 list.json(공시검색)으로 받는다.
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
		try (ZipInputStream zip = new ZipInputStream(new ByteArrayInputStream(body), StandardCharsets.UTF_8)) {
			if (zip.getNextEntry() == null) {
				throw new IllegalStateException("DART corpCode.xml: ZIP이 비어 있어요");
			}
			return parseCorpCodes(zip);
		}
		catch (IOException | XMLStreamException e) {
			throw new IllegalStateException("DART corpCode.xml을 읽지 못했어요: " + e.getMessage(), e);
		}
	}

	/** <list><corp_code>…</corp_code><stock_code>…</stock_code></list> 중 종목코드가 있는 것만. */
	static Map<String, String> parseCorpCodes(InputStream xml) throws XMLStreamException {
		XMLInputFactory f = XMLInputFactory.newFactory();
		f.setProperty(XMLInputFactory.SUPPORT_DTD, false);
		f.setProperty(XMLInputFactory.IS_SUPPORTING_EXTERNAL_ENTITIES, false);
		XMLStreamReader r = f.createXMLStreamReader(xml);
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
			pause();
			Map<String, Object> res;
			try {
				res = http.get()
					.uri(baseUrl + "/api/list.json?crtfc_key={key}&corp_code={corp}&bgn_de={from}&end_de={to}&page_no={page}&page_count={count}",
							apiKey, corpCode, from.format(YMD), to.format(YMD), page, PAGE_COUNT)
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
				return out;
			}
			if (!"000".equals(status)) {
				throw new DartException(status, String.valueOf(res.get("message")));
			}
			if (res.get("list") instanceof List<?> rows) {
				for (Object o : rows) {
					if (o instanceof Map<?, ?> row && row.get("rcept_no") instanceof String no && row.get("report_nm") instanceof String name
							&& row.get("rcept_dt") instanceof String dt) {
						String filer = row.get("flr_nm") instanceof String s && !s.isBlank() ? s.trim() : null;
						out.add(new Disclosure(no.trim(), name.trim(), filer, LocalDate.parse(dt.trim(), YMD)));
					}
				}
			}
			int totalPages = res.get("total_page") instanceof Number n ? n.intValue() : 1;
			if (page >= totalPages) {
				break;
			}
		}
		return out;
	}

	private RuntimeException hideKey(RestClientException e) {
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

		DartException(String status, String message) {
			super("DART " + status + ": " + message);
			this.status = status;
		}

		public String status() {
			return status;
		}

		/** 다음 호출도 같은 이유로 실패할 오류인지(키 문제·한도 초과). */
		public boolean stopsRun() {
			return status != null && List.of("010", "011", "012", "020", "901").contains(status);
		}
	}
}
