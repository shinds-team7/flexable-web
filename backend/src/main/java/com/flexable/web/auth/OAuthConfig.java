package com.flexable.web.auth;

import java.time.Duration;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.http.client.SimpleClientHttpRequestFactory;
import org.springframework.web.client.RestClient;

/** 소셜 공급자 호출용 클라이언트. 요청 처리 중에 부르므로 시간 제한을 짧게 둔다. */
@Configuration
public class OAuthConfig {

	@Bean
	RestClient oauthRestClient() {
		SimpleClientHttpRequestFactory factory = new SimpleClientHttpRequestFactory();
		factory.setConnectTimeout(Duration.ofSeconds(3));
		factory.setReadTimeout(Duration.ofSeconds(5));
		return RestClient.builder().requestFactory(factory).build();
	}
}
