package com.flexable.web.newssearch;

import java.net.http.HttpClient;
import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

import com.flexable.web.market.NewsSearch;

/**
 * 뉴스 검색 소스 선택(app.news-search.source = NEWS_SEARCH_SOURCE). api가 사건 상세 요청 중 부르는 외부 호출 예외다(04 §8 ④).
 * 사용자가 기다리므로 연결 3초·읽기 5초로 짧게 끊는다.
 */
@Configuration
public class NewsSearchConfig {

	@Bean
	NewsSearch newsSearch(NewsSearchProperties props) {
		return switch (props.source()) {
			case "naver" -> new NaverNewsSearch(builder(), props);
			case "fake" -> new FakeNewsSearch();
			default -> throw new IllegalArgumentException("알 수 없는 NEWS_SEARCH_SOURCE: " + props.source());
		};
	}

	private static RestClient.Builder builder() {
		HttpClient client = HttpClient.newBuilder().version(HttpClient.Version.HTTP_1_1).connectTimeout(Duration.ofSeconds(3)).build();
		JdkClientHttpRequestFactory factory = new JdkClientHttpRequestFactory(client);
		factory.setReadTimeout(Duration.ofSeconds(5));
		return RestClient.builder().requestFactory(factory);
	}
}
