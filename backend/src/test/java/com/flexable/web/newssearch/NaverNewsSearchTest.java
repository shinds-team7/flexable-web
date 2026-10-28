package com.flexable.web.newssearch;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.queryParam;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withStatus;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.io.IOException;
import java.io.InputStream;
import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.HttpStatus;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.NewsSearch;
import com.flexable.web.market.NewsSearch.Article;
import com.flexable.web.market.NewsSearch.Sort;

/** NAVER API HUB 뉴스 검색: 요청 형식·헤더, 응답 fixture 파싱(태그·엔티티·RFC 1123 pubDate), 오류 코드 분류, 키를 남기지 않음. */
class NaverNewsSearchTest {

	static final String KEY_ID = "test-key-id";
	static final String KEY = "test-secret-value";
	static final LocalDate D = LocalDate.of(2026, 3, 10);

	MockRestServiceServer server;
	NaverNewsSearch client;

	@BeforeEach
	void setup() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		client = new NaverNewsSearch(builder, new NewsSearchProperties("naver", "https://hub.example.com/", KEY_ID, KEY));
	}

	static String fixture() throws IOException {
		try (InputStream in = NaverNewsSearchTest.class.getResourceAsStream("/fixtures/naver/news.json")) {
			return new String(in.readAllBytes(), StandardCharsets.UTF_8);
		}
	}

	@Test
	void 헤더에_키를_넣고_query_display_sort만_보낸다() throws IOException {
		server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://hub.example.com/search/v1/news?")))
			.andExpect(method(HttpMethod.GET))
			.andExpect(header("X-NCP-APIGW-API-KEY-ID", KEY_ID))
			.andExpect(header("X-NCP-APIGW-API-KEY", KEY))
			.andExpect(queryParam("query", "%EC%82%BC%EC%84%B1%EC%A0%84%EC%9E%90%20%EA%B8%89%EB%93%B1"))
			.andExpect(queryParam("display", "100"))
			.andExpect(queryParam("start", "1"))
			.andExpect(queryParam("sort", "date"))
			.andRespond(withSuccess(fixture(), MediaType.APPLICATION_JSON));
		List<Article> items = client.search("삼성전자 급등", Sort.DATE, D, D);
		server.verify();
		assertThat(items).hasSize(2);
	}

	@Test
	void 응답_fixture를_읽는다() throws IOException {
		List<Article> items = NaverNewsSearch.parse(fixture());
		assertThat(items).hasSize(2); // 발행 시각을 못 읽거나 http(s) 링크가 없는 기사는 뺀다
		Article a = items.get(0);
		assertThat(a.title()).isEqualTo("삼성전자 주가 \"급등\"… 반도체 & AI 기대");
		assertThat(a.url()).isEqualTo("https://www.hankyung.com/article/2026031012345");
		assertThat(a.publisher()).isEqualTo("www.hankyung.com");
		assertThat(a.publishedAt()).isEqualTo(OffsetDateTime.parse("2026-03-10T15:42:00+09:00"));
		Article b = items.get(1);
		assertThat(b.title()).isEqualTo("원문 링크가 없는 기사 <속보>");
		assertThat(b.url()).isEqualTo("https://n.news.naver.com/mnews/article/001/0001000002"); // 원문이 없으면 네이버 링크
		assertThat(b.publisher()).isNull();
	}

	@Test
	void 제목의_태그와_엔티티만_푼다() {
		assertThat(NaverNewsSearch.cleanTitle("<b>LG</b>에너지 &#x27;최고&#39; &lt;b&gt;")).isEqualTo("LG에너지 '최고' <b>");
		assertThat(NaverNewsSearch.cleanTitle("모르는 엔티티 &foo; 그대로 &#xZZ;")).isEqualTo("모르는 엔티티 &foo; 그대로 &#xZZ;");
		assertThat(NaverNewsSearch.cleanTitle("  공백·기호 [단독] 100%  ")).isEqualTo("공백·기호 [단독] 100%");
	}

	@Test
	void pubDate는_RFC_1123_형식() {
		assertThat(NaverNewsSearch.pubDate("Mon, 2 Mar 2026 07:50:00 +0900")).isEqualTo(OffsetDateTime.parse("2026-03-02T07:50:00+09:00"));
		assertThat(NaverNewsSearch.pubDate("2026-03-02")).isNull();
	}

	@Test
	void 검색_오류_코드는_이번_요청만_멈추고_키_한도_오류는_그날_멈춘다() {
		for (String code : List.of("SE01", "SE02", "SE03", "SE04", "SE06")) {
			NewsSearch.Unavailable u = NaverNewsSearch.error(400, "{\"errorMessage\":\"Incorrect query request\",\"errorCode\":\"" + code + "\"}");
			assertThat(u.getMessage()).isEqualTo("NAVER 400 " + code);
			assertThat(u.stopsToday()).isFalse();
		}
		assertThat(NaverNewsSearch.error(404, "{\"errorCode\":\"SE05\"}").stopsToday()).isFalse();
		assertThat(NaverNewsSearch.error(500, "{\"errorCode\":\"SE99\"}").getMessage()).isEqualTo("NAVER 500 SE99");
		assertThat(NaverNewsSearch.error(500, "<html>점검</html>").getMessage()).isEqualTo("NAVER 500");
		NewsSearch.Unavailable quota = NaverNewsSearch.error(429, "{\"error\":{\"errorCode\":\"400\",\"message\":\"Quota Exceeded\"}}");
		assertThat(quota.stopsToday()).isTrue();
		assertThat(quota.getMessage()).isEqualTo("NAVER 429 400");
		assertThat(NaverNewsSearch.error(401, "{\"error\":{\"errorCode\":\"200\",\"message\":\"Authentication Failed\"}}").stopsToday()).isTrue();
	}

	@Test
	void 오류_응답은_Unavailable이고_키와_본문을_남기지_않는다() {
		server.expect(requestTo(org.hamcrest.Matchers.startsWith("https://hub.example.com/search/v1/news")))
			.andRespond(withStatus(HttpStatus.TOO_MANY_REQUESTS).contentType(MediaType.APPLICATION_JSON)
				.body("{\"error\":{\"errorCode\":\"400\",\"message\":\"" + KEY + "\"}}"));
		assertThatThrownBy(() -> client.search("삼성전자", Sort.SIM, D, D)).isInstanceOf(NewsSearch.Unavailable.class)
			.satisfies(e -> {
				assertThat(((NewsSearch.Unavailable) e).stopsToday()).isTrue();
				assertThat(e.getMessage()).doesNotContain(KEY).doesNotContain(KEY_ID);
			});
		server.verify();
	}

	@Test
	void 키가_없으면_꺼져_있고_부르지_않는다() {
		NewsSearchProperties none = new NewsSearchProperties("naver", null, "", null);
		assertThat(new NaverNewsSearch(RestClient.builder(), none).enabled()).isFalse();
		assertThat(none.toString()).doesNotContain("null").contains("configured=false");
		assertThat(new NewsSearchProperties("naver", null, KEY_ID, KEY).toString()).doesNotContain(KEY).doesNotContain(KEY_ID);
		assertThatThrownBy(() -> new NaverNewsSearch(RestClient.builder(), none).search("x", Sort.SIM, D, D))
			.isInstanceOf(NewsSearch.Unavailable.class);
	}

	@Test
	void 예시_소스는_기간_안_2건과_기간_밖_1건() {
		FakeNewsSearch fake = new FakeNewsSearch();
		List<Article> items = fake.search("삼성전자 급등", Sort.SIM, D, D.plusDays(6));
		assertThat(fake.sample()).isTrue();
		assertThat(items).hasSize(3);
		assertThat(items).filteredOn(a -> a.publishedAt().toLocalDate().isAfter(D.plusDays(6))).hasSize(1);
	}
}
