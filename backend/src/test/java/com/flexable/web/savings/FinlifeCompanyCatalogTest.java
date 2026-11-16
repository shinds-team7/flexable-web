package com.flexable.web.savings;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;

/** 공시 홈페이지 값 → 링크로 쓸 http·https 주소(#449). */
class FinlifeCompanyCatalogTest {

	@Test
	void http와_https는_그대로_둔다() {
		assertThat(FinlifeCompanyCatalog.normalize("http://www.example-bank.co.kr")).isEqualTo("http://www.example-bank.co.kr");
		assertThat(FinlifeCompanyCatalog.normalize(" https://www.example-bank.co.kr/main ")).isEqualTo("https://www.example-bank.co.kr/main");
		assertThat(FinlifeCompanyCatalog.normalize("HTTPS://WWW.EXAMPLE.CO.KR")).isEqualTo("HTTPS://WWW.EXAMPLE.CO.KR");
	}

	@Test
	void scheme이_없으면_http를_붙인다() {
		assertThat(FinlifeCompanyCatalog.normalize("www.example-sb.co.kr")).isEqualTo("http://www.example-sb.co.kr");
		assertThat(FinlifeCompanyCatalog.normalize("example.com/bank")).isEqualTo("http://example.com/bank");
	}

	@Test
	void 링크로_쓸_수_없는_값은_null() {
		assertThat(FinlifeCompanyCatalog.normalize(null)).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("  ")).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("javascript:alert(1)")).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("ftp://files.example.co.kr")).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("http://")).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("http://user@evil.example.com")).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("없음")).isNull();
		assertThat(FinlifeCompanyCatalog.normalize("http://www.example.co.kr/" + "a".repeat(300))).isNull();
	}
}
