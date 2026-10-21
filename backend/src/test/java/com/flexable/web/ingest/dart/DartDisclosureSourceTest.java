package com.flexable.web.ingest.dart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.ByteArrayOutputStream;
import java.io.IOException;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.LocalDate;
import java.util.List;
import java.util.zip.ZipEntry;
import java.util.zip.ZipOutputStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.Disclosure;

class DartDisclosureSourceTest {

	private static final String KEY = "SECRETKEY123";
	private static final String LIST = "https://dart.test/api/list.json?crtfc_key=" + KEY
			+ "&corp_code=00126380&bgn_de=20250401&end_de=20250411&page_no=%d&page_count=100";

	private MockRestServiceServer server;
	private DartDisclosureSource dart;

	@BeforeEach
	void setUp() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		dart = new DartDisclosureSource(builder.build(), "https://dart.test", KEY, Duration.ZERO);
	}

	private List<Disclosure> list() {
		return dart.disclosures("00126380", LocalDate.of(2025, 4, 1), LocalDate.of(2025, 4, 11));
	}

	@Test
	void 공시_목록을_페이지를_넘겨_읽는다() {
		server.expect(requestTo(LIST.formatted(1))).andRespond(withSuccess("""
				{"status":"000","message":"정상","page_no":1,"total_page":2,"list":[
				 {"corp_code":"00126380","corp_name":"삼성전자","stock_code":"005930","report_nm":"연결재무제표기준영업(잠정)실적(공정공시)",
				  "rcept_no":"20250408800001","flr_nm":"삼성전자","rcept_dt":"20250408","rm":"유"}]}
				""", MediaType.APPLICATION_JSON));
		server.expect(requestTo(LIST.formatted(2))).andRespond(withSuccess("""
				{"status":"000","message":"정상","page_no":2,"total_page":2,"list":[
				 {"report_nm":"임원ㆍ주요주주특정증권등소유상황보고서","rcept_no":"20250402000123","flr_nm":"홍길동","rcept_dt":"20250402"}]}
				""", MediaType.APPLICATION_JSON));

		List<Disclosure> got = list();
		server.verify();
		assertThat(got).containsExactly(
				new Disclosure("20250408800001", "연결재무제표기준영업(잠정)실적(공정공시)", "삼성전자", LocalDate.of(2025, 4, 8)),
				new Disclosure("20250402000123", "임원ㆍ주요주주특정증권등소유상황보고서", "홍길동", LocalDate.of(2025, 4, 2)));
		assertThat(dart.url(got.getFirst())).isEqualTo("https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20250408800001");
	}

	@Test
	void 공시가_없으면_빈_목록() {
		server.expect(requestTo(LIST.formatted(1)))
			.andRespond(withSuccess("{\"status\":\"013\",\"message\":\"조회된 데이타가 없습니다.\"}", MediaType.APPLICATION_JSON));
		assertThat(list()).isEmpty();
	}

	@Test
	void 한도_초과는_실행을_멈추는_오류() {
		server.expect(requestTo(LIST.formatted(1)))
			.andRespond(withSuccess("{\"status\":\"020\",\"message\":\"요청 제한을 초과하였습니다.\"}", MediaType.APPLICATION_JSON));
		assertThatThrownBy(this::list).isInstanceOfSatisfying(DartDisclosureSource.DartException.class, e -> {
			assertThat(e.status()).isEqualTo("020");
			assertThat(e.stopsRun()).isTrue();
		});
	}

	@Test
	void 연결_오류_메시지에_인증키가_남지_않는다() {
		server.expect(requestTo(LIST.formatted(1))).andRespond(withException(new IOException("connection reset")));
		assertThatThrownBy(this::list).hasMessageNotContaining(KEY).hasMessageContaining("DART 호출 실패");
	}

	@Test
	void 고유번호_ZIP에서_상장_종목만_읽는다() throws IOException {
		String xml = """
				<?xml version="1.0" encoding="UTF-8"?>
				<result>
				 <list><corp_code>00126380</corp_code><corp_name>삼성전자</corp_name><stock_code>005930</stock_code><modify_date>20250101</modify_date></list>
				 <list><corp_code>00999999</corp_code><corp_name>비상장회사</corp_name><stock_code> </stock_code><modify_date>20250101</modify_date></list>
				 <list><corp_code>00164779</corp_code><corp_name>SK하이닉스</corp_name><stock_code>000660</stock_code><modify_date>20250101</modify_date></list>
				</result>
				""";
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
			zip.putNextEntry(new ZipEntry("CORPCODE.xml"));
			zip.write(xml.getBytes(StandardCharsets.UTF_8));
			zip.closeEntry();
		}
		server.expect(requestTo("https://dart.test/api/corpCode.xml?crtfc_key=" + KEY))
			.andRespond(withSuccess(bytes.toByteArray(), MediaType.APPLICATION_OCTET_STREAM));

		assertThat(dart.corpCodes()).containsExactlyInAnyOrderEntriesOf(java.util.Map.of("005930", "00126380", "000660", "00164779"));
	}

	@Test
	void 고유번호_요청이_거절되면_상태를_알려준다() {
		server.expect(requestTo("https://dart.test/api/corpCode.xml?crtfc_key=" + KEY)).andRespond(withSuccess(
				"<result><status>010</status><message>등록되지 않은 키입니다.</message></result>", MediaType.APPLICATION_XML));
		assertThatThrownBy(dart::corpCodes).isInstanceOfSatisfying(DartDisclosureSource.DartException.class, e -> {
			assertThat(e.status()).isEqualTo("010");
			assertThat(e.stopsRun()).isTrue();
		});
	}

	@Test
	void 키가_없으면_꺼진다() {
		assertThat(new DartDisclosureSource(RestClient.create(), "https://dart.test", " ", Duration.ZERO).enabled()).isFalse();
	}
}
