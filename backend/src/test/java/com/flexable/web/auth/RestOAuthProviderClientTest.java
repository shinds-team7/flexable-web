package com.flexable.web.auth;

import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.content;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.header;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.method;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;
import java.util.List;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.http.HttpMethod;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

class RestOAuthProviderClientTest {
	private MockRestServiceServer server;
	private RestOAuthProviderClient client;

	@BeforeEach
	void setup() {
		RestClient.Builder builder = RestClient.builder();
		server = MockRestServiceServer.bindTo(builder).build();
		client = new RestOAuthProviderClient(builder.build(), new OAuthProperties("http://localhost:8080", List.of(),
				new OAuthProperties.Kakao("test-kakao", "", "test-admin", ""),
				new OAuthProperties.Google("test-google", "test-secret")));
	}
	@Test
	void kakaoRequiresBothEmailFlagsAndConvertsNumericId() {
		for (boolean valid : new boolean[] { false, true }) {
			for (boolean verified : new boolean[] { false, true }) {
				server.expect(requestTo("https://kauth.kakao.com/oauth/token"))
					.andExpect(method(HttpMethod.POST))
					.andExpect(content().contentType(MediaType.APPLICATION_FORM_URLENCODED))
					.andExpect(content().string("grant_type=authorization_code&client_id=test-kakao&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fapi%2Fv1%2Fauth%2Foauth%2Fkakao%2Fcallback&code=code"))
					.andRespond(withSuccess("""
						{"access_token":"fake-token"}
						""", MediaType.APPLICATION_JSON));
				server.expect(requestTo("https://kapi.kakao.com/v2/user/me"))
					.andExpect(header("Authorization", "Bearer fake-token"))
					.andRespond(withSuccess("""
						{"id":12345,"kakao_account":{"email":"test@example.com","is_email_valid":%s,"is_email_verified":%s}}
						""".formatted(valid, verified), MediaType.APPLICATION_JSON));
				OAuthProviderClient.Profile profile = client.fetch("kakao", "code");
				assertEquals("12345", profile.providerUserId());
				assertEquals(valid && verified, profile.emailVerified());
				server.verify();
				server.reset();
			}
		}
	}
	@Test
	void googleUsesUserinfoVerificationFlag() {
		server.expect(requestTo("https://oauth2.googleapis.com/token"))
			.andExpect(method(HttpMethod.POST))
			.andExpect(content().string("grant_type=authorization_code&client_id=test-google&redirect_uri=http%3A%2F%2Flocalhost%3A8080%2Fapi%2Fv1%2Fauth%2Foauth%2Fgoogle%2Fcallback&code=code&client_secret=test-secret"))
			.andRespond(withSuccess("""
				{"access_token":"fake-token"}
				""", MediaType.APPLICATION_JSON));
		server.expect(requestTo("https://openidconnect.googleapis.com/v1/userinfo"))
			.andExpect(header("Authorization", "Bearer fake-token"))
			.andRespond(withSuccess("""
				{"sub":"google-sub","email":"test@example.com","email_verified":true}
				""", MediaType.APPLICATION_JSON));
		assertEquals(new OAuthProviderClient.Profile("google-sub", "test@example.com", true), client.fetch("google", "code"));
		server.verify();
	}
	@Test
	void unlinkUsesAdminAuthorizationAndTarget() {
		server.expect(requestTo("https://kapi.kakao.com/v1/user/unlink"))
			.andExpect(method(HttpMethod.POST)).andExpect(header("Authorization", "KakaoAK test-admin"))
			.andExpect(content().string("target_id_type=user_id&target_id=12345"))
			.andRespond(withSuccess("{}", MediaType.APPLICATION_JSON));
		client.unlinkKakao("12345");
		server.verify();
	}
}
