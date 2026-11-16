package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.savings.FinlifeCompanyCatalog.CompanyData;

/**
 * finlife 금융회사 응답 → 회사 번호·이름·홈페이지(#449). fixture는 finlife 금융회사 API 안내(menuNo=700051)의
 * 응답 필드 이름·형식을 따른 가상 회사다. 담당자 이름(dcls_chrg_man)은 받지 않는다.
 */
class FinlifeClientTest {

	private static final String BASE = "https://finlife.test/finlifeapi";
	private final FinlifeProperties props = new FinlifeProperties("KEY", BASE, null, null);

	private static String url(String group, int page) {
		return BASE + "/companySearch.json?auth=KEY&topFinGrpNo=" + group + "&pageNo=" + page;
	}

	private static String body(int maxPage, String baseList) {
		return """
				{"result":{"prdt_div":"F","total_count":"3","max_page_no":"%d","now_page_no":"1","err_cd":"000","err_msg":"정상",
				"baseList":[%s],
				"optionList":[{"dcls_month":"202610","fin_co_no":"0010001","area_cd":"01","area_nm":"서울","exis_yn":"Y"}]}}
				""".formatted(maxPage, baseList);
	}

	private static String company(String no, String name, String homepage) {
		return """
				{"dcls_month":"202610","fin_co_no":"%s","kor_co_nm":"%s","dcls_chrg_man":"공시 담당","homp_url":"%s","cal_tel":"15880000"}"""
			.formatted(no, name, homepage);
	}

	@Test
	void 모든_권역_모든_쪽의_금융회사를_받는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
		server.expect(requestTo(url("020000", 1)))
			.andRespond(withSuccess(body(2, company("0010001", "예시은행", "http://www.example-bank.co.kr")), MediaType.APPLICATION_JSON));
		server.expect(requestTo(url("020000", 2)))
			.andRespond(withSuccess(body(2, company("0010002", "둘째은행", "")), MediaType.APPLICATION_JSON));
		server.expect(requestTo(url("030300", 1)))
			.andRespond(withSuccess(body(1, company("0020001", "예시저축은행", "www.example-sb.co.kr")), MediaType.APPLICATION_JSON));

		List<CompanyData> all = new FinlifeClient(props, builder.build()).fetchCompanies();

		server.verify();
		assertThat(all).containsExactlyInAnyOrder(
				new CompanyData("0010001", "예시은행", "http://www.example-bank.co.kr"),
				new CompanyData("0010002", "둘째은행", ""),
				new CompanyData("0020001", "예시저축은행", "www.example-sb.co.kr"));
	}

	@Test
	void 한_쪽이라도_실패하면_예외이고_인증키를_메시지에_넣지_않는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
		server.expect(requestTo(url("020000", 1)))
			.andRespond(withSuccess(body(1, company("0010001", "예시은행", "http://www.example-bank.co.kr")), MediaType.APPLICATION_JSON));
		server.expect(requestTo(url("030300", 1))).andRespond(withServerError());

		FinlifeClient client = new FinlifeClient(props, builder.build());

		assertThatThrownBy(client::fetchCompanies)
			.isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("companySearch.json")
			.hasMessageNotContaining("KEY");
	}

	@Test
	void 오류_코드면_예외() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).ignoreExpectOrder(true).build();
		server.expect(requestTo(url("020000", 1))).andRespond(withSuccess("""
				{"result":{"err_cd":"020","err_msg":"일일검색 허용횟수 초과"}}""", MediaType.APPLICATION_JSON));
		server.expect(requestTo(url("030300", 1))).andRespond(withSuccess("""
				{"result":{"err_cd":"020","err_msg":"일일검색 허용횟수 초과"}}""", MediaType.APPLICATION_JSON));

		FinlifeClient client = new FinlifeClient(props, builder.build());

		assertThatThrownBy(client::fetchCompanies).isInstanceOf(IllegalStateException.class).hasMessageContaining("020");
	}
}
