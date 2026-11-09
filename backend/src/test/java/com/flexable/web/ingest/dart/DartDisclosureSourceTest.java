package com.flexable.web.ingest.dart;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withException;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
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
import org.springframework.http.HttpStatus;
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
	void HTTP_429도_실행을_멈추는_한도_초과() {
		server.expect(requestTo(LIST.formatted(1))).andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS));
		assertThatThrownBy(() -> dart.page("00126380", LocalDate.of(2025, 4, 1), LocalDate.of(2025, 4, 11), 1))
			.isInstanceOfSatisfying(DartDisclosureSource.DartException.class, e -> {
				assertThat(e.status()).isEqualTo("429");
				assertThat(e.stopsRun()).isTrue();
				assertThat(e.getMessage()).doesNotContain(KEY);
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

	@Test
	void 주요사항보고서_주요정보를_글자_그대로_읽고_자료가_없으면_빈_목록이다() {
		String url = "https://dart.test/api/piicDecsn.json?crtfc_key=" + KEY + "&corp_code=00126380&bgn_de=20250101&end_de=20250411";
		server.expect(requestTo(url)).andRespond(withSuccess("""
				{"status":"000","message":"정상","list":[
				 {"rcept_no":"20250408000001","corp_name":"삼성전자","nstk_ostk_cnt":"1,000,000","bfic_tisstk_ostk":"10,000,000","ic_mthn":"제3자배정증자"}]}
				""", MediaType.APPLICATION_JSON));
		server.expect(requestTo(url)).andRespond(withSuccess("{\"status\":\"013\",\"message\":\"조회된 데이타가 없습니다.\"}", MediaType.APPLICATION_JSON));
		server.expect(requestTo(url)).andRespond(withSuccess("{\"status\":\"020\",\"message\":\"요청 제한을 초과하였습니다.\"}", MediaType.APPLICATION_JSON));

		var rows = dart.majorReport("piicDecsn", "00126380", LocalDate.of(2025, 1, 1), LocalDate.of(2025, 4, 11));
		assertThat(rows).hasSize(1);
		assertThat(rows.getFirst()).containsEntry("rcept_no", "20250408000001").containsEntry("nstk_ostk_cnt", "1,000,000");
		assertThat(dart.majorReport("piicDecsn", "00126380", LocalDate.of(2025, 1, 1), LocalDate.of(2025, 4, 11))).isEmpty();
		assertThatThrownBy(() -> dart.majorReport("piicDecsn", "00126380", LocalDate.of(2025, 1, 1), LocalDate.of(2025, 4, 11)))
			.isInstanceOfSatisfying(DartDisclosureSource.DartException.class, e -> assertThat(e.stopsRun()).isTrue())
			.hasMessageNotContaining(KEY);
		assertThatThrownBy(() -> dart.majorReport("../list", "00126380", LocalDate.of(2025, 1, 1), LocalDate.of(2025, 4, 11)))
			.isInstanceOf(IllegalArgumentException.class);
		server.verify();
	}

	@Test
	void 정상_상태여도_목록이_없거나_접수번호가_잘못되면_형식_오류로_다시_받게_한다() {
		String url = "https://dart.test/api/piicDecsn.json?crtfc_key=" + KEY + "&corp_code=00126380&bgn_de=20250101&end_de=20250411";
		for (String body : List.of("{\"status\":\"000\",\"message\":\"정상\"}", "{\"status\":\"000\",\"message\":\"정상\",\"list\":[]}",
				"{\"status\":\"000\",\"message\":\"정상\",\"list\":{\"rcept_no\":\"20250408000001\"}}",
				"{\"status\":\"000\",\"message\":\"정상\",\"list\":[{\"corp_name\":\"삼성전자\"}]}",
				"{\"status\":\"000\",\"message\":\"정상\",\"list\":[{\"rcept_no\":\"2025-04-08\"}]}",
				"{\"status\":\"000\",\"message\":\"정상\",\"list\":[{\"rcept_no\":\"20250408000001\"},{\"rcept_no\":\"\"}]}")) {
			server.expect(requestTo(url)).andRespond(withSuccess(body, MediaType.APPLICATION_JSON));
		}
		for (int i = 0; i < 6; i++) {
			assertThatThrownBy(() -> dart.majorReport("piicDecsn", "00126380", LocalDate.of(2025, 1, 1), LocalDate.of(2025, 4, 11)))
				.isInstanceOf(IllegalStateException.class)
				.isNotInstanceOf(DartDisclosureSource.DartException.class)
				.hasMessageContaining("형식 오류")
				.hasMessageNotContaining(KEY);
		}
		server.verify();
	}

	/** DART 공시서류 XML 꼴(표지·요약 정보·표)의 예시. 회사·사람 이름은 가상 값이다 */
	static final String DOCUMENT = """
			<?xml version="1.0" encoding="utf-8"?>
			<DOCUMENT>
			<DOCUMENT-NAME ACODE="11302">주요사항보고서(자기주식취득결정)</DOCUMENT-NAME>
			<FORMULA-VERSION ADATE="20140101">5.4</FORMULA-VERSION>
			<COMPANY-NAME AREGCIK="00000001">한빛전자</COMPANY-NAME>
			<SUMMARY><EXTRACTION ACODE="CORP_NAME">한빛전자</EXTRACTION></SUMMARY>
			<BODY>
			<COVER><COVER-TITLE>주요사항보고서</COVER-TITLE><TABLE><TBODY><TR><TD>대표이사</TD><TD>홍길동</TD></TR><TR><TD>본점 소재지</TD><TD>서울시 중구</TD></TR></TBODY></TABLE></COVER>
			<SECTION-1><TITLE>자기주식 취득 결정</TITLE>
			<TABLE><TBODY>
			<TR><TD>1. 취득예정주식(주)</TD><TE>보통주식</TE><TE>1,000,000</TE></TR>
			<TR><TD>2. 취득예정금액(원)</TD><TE>보통주식</TE><TE>5,000,000,000</TE></TR>
			<TR><TD>3. 취득목적</TD><TE COLSPAN="2">주주가치 제고 &amp; 주가안정</TE></TR>
			<TR><TD>4. 위탁투자중개업자</TD><TE COLSPAN="2">가람증권(주)</TE></TR>
			</TBODY></TABLE>
			<P>취득 후 발행주식총수 대비 비중은 2.34%입니다.<IMAGE><IMG>a.jpg</IMG></IMAGE></P>
			</SECTION-1>
			</BODY>
			</DOCUMENT>
			""";

	private static byte[] zip(String... nameAndXml) throws IOException {
		ByteArrayOutputStream bytes = new ByteArrayOutputStream();
		try (ZipOutputStream zip = new ZipOutputStream(bytes)) {
			for (int i = 0; i < nameAndXml.length; i += 2) {
				zip.putNextEntry(new ZipEntry(nameAndXml[i]));
				zip.write(nameAndXml[i + 1].getBytes(StandardCharsets.UTF_8));
				zip.closeEntry();
			}
		}
		return bytes.toByteArray();
	}

	@Test
	void 공시서류원본파일에서_표지를_빼고_본문_글만_뽑는다() throws IOException {
		String no = "20250408000123";
		server.expect(requestTo("https://dart.test/api/document.xml?crtfc_key=" + KEY + "&rcept_no=" + no))
			.andRespond(withSuccess(zip(no + "_00760.xml", "<DOCUMENT><BODY><P>첨부 서류</P></BODY></DOCUMENT>", no + ".xml", DOCUMENT),
					MediaType.APPLICATION_OCTET_STREAM));

		String text = dart.documentText(no);
		server.verify();
		// 본문 파일(접수번호.xml)을 읽고, 표는 칸을 " | "로 잇는다
		assertThat(text).isEqualTo("""
				자기주식 취득 결정
				1. 취득예정주식(주) | 보통주식 | 1,000,000
				2. 취득예정금액(원) | 보통주식 | 5,000,000,000
				3. 취득목적 | 주주가치 제고 & 주가안정
				4. 위탁투자중개업자 | 가람증권(주)
				취득 후 발행주식총수 대비 비중은 2.34%입니다.""");
		// 표지(대표이사 이름·주소)·회사 이름·요약 정보·그림은 보내지 않는다
		assertThat(text).doesNotContain("홍길동").doesNotContain("서울시").doesNotContain("한빛전자").doesNotContain("a.jpg").doesNotContain("첨부");
	}

	@Test
	void 원문_파일이_없으면_null이고_키_문제는_실행을_멈춘다() {
		server.expect(requestTo("https://dart.test/api/document.xml?crtfc_key=" + KEY + "&rcept_no=20250408000001")).andRespond(withSuccess(
				"<result><status>014</status><message>파일이 존재하지 않습니다.</message></result>", MediaType.APPLICATION_XML));
		server.expect(requestTo("https://dart.test/api/document.xml?crtfc_key=" + KEY + "&rcept_no=20250408000002")).andRespond(withSuccess(
				"<result><status>020</status><message>요청 제한을 초과하였습니다.</message></result>", MediaType.APPLICATION_XML));
		assertThat(dart.documentText("20250408000001")).isNull();
		assertThatThrownBy(() -> dart.documentText("20250408000002"))
			.isInstanceOfSatisfying(DartDisclosureSource.DartException.class, e -> assertThat(e.stopsRun()).isTrue());
		assertThatThrownBy(() -> dart.documentText("../etc")).isInstanceOf(IllegalArgumentException.class);
	}

	@Test
	void 선언한_인코딩으로_읽는다() {
		byte[] euc = "<?xml version=\"1.0\" encoding=\"euc-kr\"?><P>공시</P>".getBytes(java.nio.charset.Charset.forName("MS949"));
		assertThat(DartDisclosureSource.bodyText(DartDisclosureSource.decode(euc))).isEqualTo("공시");
		// 닫는 태그가 없는 표지는 끝까지 지운다
		assertThat(DartDisclosureSource.bodyText("<P>앞</P><COVER><P>대표이사 홍길동</P>")).isEqualTo("앞");
	}

	@Test
	void 칸마다_줄이_나뉜_표도_한_행을_한_줄로_읽고_긴_표는_앞뒤만_남긴다() {
		StringBuilder rows = new StringBuilder();
		for (int i = 1; i <= 20; i++) {
			rows.append("<TR>\n<TU>2026.09.").append(i).append("</TU>\n<TE>60,000</TE>\n<TE>178,651</TE>\n</TR>\n");
		}
		String xml = "<TABLE><TR>\n<TH>일 자</TH>\n<TH>수 량</TH>\n<TH>단가</TH>\n</TR>\n" + rows
				+ "<TR><TU>계</TU><TE><P>1,200,000</P></TE><TE>-</TE></TR></TABLE>\n<TABLE><TR>\n<TD>비율</TD>\n<TE>3.47</TE>\n</TR></TABLE>";
		assertThat(DartDisclosureSource.bodyText(xml)).isEqualTo("""
				일 자 | 수 량 | 단가
				2026.09.1 | 60,000 | 178,651
				2026.09.2 | 60,000 | 178,651
				(같은 꼴의 행 16개 생략)
				2026.09.19 | 60,000 | 178,651
				2026.09.20 | 60,000 | 178,651
				계 | 1,200,000 | -
				비율 | 3.47""");
	}
}
