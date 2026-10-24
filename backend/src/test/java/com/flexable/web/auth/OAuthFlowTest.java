package com.flexable.web.auth;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.is;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.junit.jupiter.api.Assertions.assertThrows;
import static org.junit.jupiter.api.Assertions.assertTrue;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.doAnswer;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.verifyNoInteractions;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.content;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import org.springframework.boot.test.context.TestConfiguration;
import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Primary;
import org.springframework.context.annotation.Import;
import java.util.UUID;
import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.web.util.UriComponentsBuilder;
import com.jayway.jsonpath.JsonPath;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.user.UserWithdrawalListener;

@SpringBootTest(properties = { "app.auth.oauth.kakao.client-id=test-kakao", "app.auth.oauth.google.client-id=test-google",
		"app.auth.oauth.kakao.admin-key=test-admin" })
@AutoConfigureMockMvc
@Import({ OAuthFlowTest.TestTimeConfig.class, OAuthFlowTest.FailingWithdrawalConfig.class })
class OAuthFlowTest {
	private static final String REDIRECT = "http://localhost:5173/oauth/callback";
	private static final String VERIFIER = "test-verifier-with-32-random-bytes-equivalent";
	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcTemplate jdbc;
	@MockitoBean
	OAuthProviderClient provider;
	@Autowired
	MutableClock clock;
	@Autowired
	AuthService authService;

	@BeforeEach
	void setup() {
		clock.now = Instant.now();
	}
	private ResultActions json(String path, String body) throws Exception {
		return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
	}
	private String query(String url, String key) {
		String value = UriComponentsBuilder.fromUriString(url).build().getQueryParams().getFirst(key);
		return value == null ? null : java.net.URLDecoder.decode(value, StandardCharsets.UTF_8);
	}
	private String start(String name, String redirect) throws Exception {
		String location = mvc.perform(get("/api/v1/auth/oauth/" + name + "/start")
			.param("redirectUri", redirect).param("codeChallenge", OAuthService.challenge(VERIFIER)))
			.andExpect(status().isFound()).andReturn().getResponse().getHeader("Location");
		return query(location, "state");
	}
	private String callback(String name, String state) throws Exception {
		return mvc.perform(get("/api/v1/auth/oauth/" + name + "/callback").param("state", state).param("code", "provider-code"))
			.andExpect(status().isFound()).andReturn().getResponse().getHeader("Location");
	}
	private String loginCode(String name, String email, boolean verified) throws Exception {
		when(provider.fetch(eq(name), anyString())).thenReturn(new OAuthProviderClient.Profile(UUID.randomUUID().toString(), email, verified));
		return query(callback(name, start(name, REDIRECT)), "code");
	}
	private ResultActions exchange(String code, String verifier) throws Exception {
		return json("/api/v1/auth/oauth/exchange", """
				{"code":"%s","codeVerifier":"%s"}
				""".formatted(code, verifier));
	}
	private String body(ResultActions result) throws Exception {
		return result.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
	}

	@TestConfiguration
	static class TestTimeConfig {
		@Bean
		@Primary
		MutableClock testClock() { return new MutableClock(); }
	}
	/** 탈퇴 도중 실패(롤백)를 만들려고, 지정한 회원의 탈퇴에서 예외를 던지는 리스너. */
	@TestConfiguration
	static class FailingWithdrawalConfig {
		static volatile long failFor = -1;

		@Bean
		UserWithdrawalListener failingWithdrawal() {
			return userId -> {
				if (userId == failFor) {
					throw new IllegalStateException("fake withdrawal failure");
				}
			};
		}
	}
	static class MutableClock extends Clock {
		Instant now = Instant.now();
		@Override public Instant instant() { return now; }
		@Override public ZoneId getZone() { return ZoneOffset.UTC; }
		@Override public Clock withZone(ZoneId zone) { return Clock.fixed(now, zone); }
	}

	@Test
	void startValidatesRedirectAndBuildsAuthorizeUrls() throws Exception {
		mvc.perform(get("/api/v1/auth/oauth/kakao/start").param("redirectUri", "https://evil.example"))
			.andExpect(status().isBadRequest()).andExpect(header().doesNotExist("Location"))
			.andExpect(jsonPath("$.code", is("VALIDATION_FAILED")));
		mvc.perform(get("/api/v1/auth/oauth/unknown/start").param("redirectUri", REDIRECT))
			.andExpect(status().isNotFound()).andExpect(jsonPath("$.code", is("NOT_FOUND")));
		mvc.perform(get("/api/v1/auth/oauth/kakao/start").param("redirectUri", REDIRECT).param("codeChallenge", "bad"))
			.andExpect(redirectedUrl(REDIRECT + "?error=failed"));
		mvc.perform(get("/api/v1/auth/oauth/providers")).andExpect(jsonPath("$.providers", contains("kakao", "google")));
		for (String name : new String[] { "kakao", "google" }) {
			String url = mvc.perform(get("/api/v1/auth/oauth/" + name + "/start")
				.param("redirectUri", REDIRECT).param("codeChallenge", OAuthService.challenge(VERIFIER)))
				.andExpect(status().isFound()).andReturn().getResponse().getHeader("Location");
			assertTrue(url.startsWith(name.equals("kakao") ? "https://kauth.kakao.com/oauth/authorize?"
					: "https://accounts.google.com/o/oauth2/v2/auth?"));
			assertEquals("test-" + name, query(url, "client_id"));
			assertEquals("http://localhost:8080/api/v1/auth/oauth/" + name + "/callback", query(url, "redirect_uri"));
			assertEquals("code", query(url, "response_type"));
			assertTrue(query(url, "state").matches("[A-Za-z0-9_-]{43}"));
			assertEquals(name.equals("google") ? "openid email" : null, query(url, "scope"));
			assertEquals(name.equals("google") ? "select_account" : null, query(url, "prompt"));
		}
	}

	@Test
	void createsVerifiedUsersAndLogsIntoExistingIdentity() throws Exception {
		for (String name : new String[] { "kakao", "google" }) {
			String email = UUID.randomUUID() + "@example.com";
			String code = loginCode(name, email, true);
			String auth = body(exchange(code, VERIFIER).andExpect(status().isOk())
				.andExpect(jsonPath("$.accessToken").isString()).andExpect(jsonPath("$.expiresAt").isString())
				.andExpect(jsonPath("$.user.email", is(email))).andExpect(jsonPath("$.user.provider", is(name)))
				.andExpect(jsonPath("$.user.hasPassword", is(false))));
			Number id = JsonPath.read(auth, "$.user.id");
			assertNull(jdbc.queryForObject("select password_hash from user_credentials where user_id=?", String.class, id));
			assertNotNull(jdbc.queryForObject("select terms_agreed_at from users where id=?", java.sql.Timestamp.class, id));
			String token = JsonPath.read(auth, "$.accessToken");
			mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token))
				.andExpect(jsonPath("$.provider", is(name))).andExpect(jsonPath("$.hasPassword", is(false)));
			exchange(query(callback(name, start(name, REDIRECT)), "code"), VERIFIER)
				.andExpect(status().isOk()).andExpect(jsonPath("$.user.id", is(id.intValue())));
			exchange(code, VERIFIER).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("OAUTH_CODE_INVALID")));
		}
	}

	@Test
	void unverifiedEmailsAreNotStoredOrUsedToLink() throws Exception {
		String email = UUID.randomUUID() + "@example.com";
		json("/api/v1/auth/signup", """
				{"email":"%s","password":"abcd1234","agreeTerms":true,"agreePrivacy":true}
				""".formatted(email))
			.andExpect(status().isCreated());
		for (String name : new String[] { "kakao", "google" }) {
			String auth = body(exchange(loginCode(name, email, false), VERIFIER).andExpect(status().isOk())
				.andExpect(jsonPath("$.user.email").doesNotExist()));
			Number id = JsonPath.read(auth, "$.user.id");
			assertNull(jdbc.queryForObject("select email from users where id=?", String.class, id));
			assertNull(jdbc.queryForObject("select email from user_identities where user_id=?", String.class, id));
		}
		json("/api/v1/auth/login", """
				{"email":"%s","password":"abcd1234"}
				""".formatted(email))
			.andExpect(status().isOk());
	}

	@Test
	void verifiedEmailLinksExistingAccountAndSendsPasswordLoginToProvider() throws Exception {
		String email = UUID.randomUUID() + "@example.com";
		String signup = body(json("/api/v1/auth/signup", """
				{"email":"%s","password":"abcd1234","agreeTerms":true,"agreePrivacy":true}
				""".formatted(email))
			.andExpect(status().isCreated()));
		Number id = JsonPath.read(signup, "$.user.id");
		String oldToken = JsonPath.read(signup, "$.accessToken");
		int oldVersion = jdbc.queryForObject("select token_version from user_credentials where user_id=?", Integer.class, id);
		String googleId = UUID.randomUUID().toString();
		when(provider.fetch(eq("google"), anyString())).thenReturn(new OAuthProviderClient.Profile(googleId, email.toUpperCase(), true));
		exchange(query(callback("google", start("google", REDIRECT)), "code"), VERIFIER)
			.andExpect(status().isOk()).andExpect(jsonPath("$.user.id", is(id.intValue())))
			.andExpect(jsonPath("$.user.provider", is("google"))).andExpect(jsonPath("$.user.hasPassword", is(false)));
		// 비밀번호는 지우지 않는다.
		assertNotNull(jdbc.queryForObject("select password_hash from user_credentials where user_id=?", String.class, id));
		assertEquals(1, jdbc.queryForObject("select count(*) from user_identities where user_id=?", Integer.class, id));
		// 남의 주소로 먼저 가입한 사람이 기존 세션이나 맞는 비밀번호로 다시 들어오지 못하고 Google로 안내된다.
		mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + oldToken)).andExpect(status().isUnauthorized());
		// 연결 전에 인증 필터를 지난 탈퇴 요청도, 잠금을 잡은 뒤 폐기된 토큰임을 알고 거절한다.
		ApiException stale = assertThrows(ApiException.class, () -> authService.withdraw(id.longValue(), oldVersion, null, "탈퇴"));
		assertEquals(ErrorCode.UNAUTHORIZED, stale.code());
		for (String password : new String[] { "abcd1234", "wrong1234" }) {
			json("/api/v1/auth/login", """
					{"email":"%s","password":"%s"}
					""".formatted(email, password))
				.andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("SOCIAL_ACCOUNT")))
				.andExpect(jsonPath("$.provider", is("google")))
				.andExpect(jsonPath("$.message", is("Google로 가입한 계정이에요. Google로 로그인해 주세요")));
		}
		// 다음 Google 로그인도, 같은 이메일의 카카오 로그인도 같은 계정으로 들어간다.
		exchange(query(callback("google", start("google", REDIRECT)), "code"), VERIFIER)
			.andExpect(status().isOk()).andExpect(jsonPath("$.user.id", is(id.intValue())));
		exchange(loginCode("kakao", email, true), VERIFIER)
			.andExpect(status().isOk()).andExpect(jsonPath("$.user.id", is(id.intValue())));
		// 같은 공급자의 다른 계정은 붙이지 않는다.
		when(provider.fetch(eq("google"), anyString())).thenReturn(new OAuthProviderClient.Profile(UUID.randomUUID().toString(), email, true));
		assertEquals(REDIRECT + "?error=email_in_use", callback("google", start("google", REDIRECT)));
		assertEquals(2, jdbc.queryForObject("select count(*) from user_identities where user_id=?", Integer.class, id));
		// 비밀번호가 남아 있어도 탈퇴는 소셜 계정처럼 확인 문구로 한다.
		when(provider.fetch(eq("google"), anyString())).thenReturn(new OAuthProviderClient.Profile(googleId, email, true));
		String token = JsonPath.read(body(exchange(query(callback("google", start("google", REDIRECT)), "code"), VERIFIER)), "$.accessToken");
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"password":"abcd1234"}
					"""))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.confirm").exists());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
			.content("""
					{"confirm":"탈퇴"}
					"""))
			.andExpect(status().isNoContent());
		assertEquals(0, jdbc.queryForObject("select count(*) from users where id=?", Integer.class, id));
	}

	@Test
	void callbackHandlesCancellationFailuresAndInvalidStates() throws Exception {
		String state = start("kakao", REDIRECT);
		mvc.perform(get("/api/v1/auth/oauth/kakao/callback").param("state", state).param("error", "access_denied"))
			.andExpect(redirectedUrl(REDIRECT + "?error=cancelled"));
		verifyNoInteractions(provider);
		for (String invalid : new String[] { state, "missing" }) {
			mvc.perform(get("/api/v1/auth/oauth/kakao/callback").param("state", invalid))
				.andExpect(status().isBadRequest()).andExpect(content().contentTypeCompatibleWith(MediaType.TEXT_HTML))
				.andExpect(content().string("로그인 요청이 만료됐어요. 처음 화면으로 돌아가 다시 시도해 주세요."));
		}
		mvc.perform(get("/api/v1/auth/oauth/kakao/callback")).andExpect(status().isBadRequest());
		String mismatch = start("kakao", REDIRECT);
		mvc.perform(get("/api/v1/auth/oauth/google/callback").param("state", mismatch)).andExpect(status().isBadRequest());
		mvc.perform(get("/api/v1/auth/oauth/kakao/callback").param("state", mismatch)).andExpect(status().isBadRequest());
		when(provider.fetch(anyString(), anyString())).thenThrow(new IllegalStateException("fake failure"));
		assertEquals("https://example.com/callback?source=web&error=failed",
				callback("google", start("google", "https://example.com/callback?source=web")));
		String expired = start("kakao", REDIRECT);
		clock.now = clock.now.plus(Duration.ofMinutes(10));
		mvc.perform(get("/api/v1/auth/oauth/kakao/callback").param("state", expired)).andExpect(status().isBadRequest());
	}

	@Test
	void invalidScopeReturnsFailedInsteadOfCancelled() throws Exception {
		String state = start("google", REDIRECT);
		mvc.perform(get("/api/v1/auth/oauth/google/callback").param("state", state).param("error", "invalid_scope"))
			.andExpect(status().isFound()).andExpect(redirectedUrl(REDIRECT + "?error=failed"));
		verifyNoInteractions(provider);
	}

	@Test
	void wrongVerifierConsumesCodeAndCodesExpire() throws Exception {
		String code = loginCode("google", null, false);
		exchange(code, "wrong").andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("OAUTH_CODE_INVALID")));
		exchange(code, VERIFIER).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("OAUTH_CODE_INVALID")));
		String expired = loginCode("google", null, false);
		clock.now = clock.now.plus(Duration.ofMinutes(2));
		exchange(expired, VERIFIER).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("OAUTH_CODE_INVALID")));
	}

	@Test
	void socialAccountRejectsPasswordLoginAndDeletesWithConfirmationEvenIfUnlinkFails() throws Exception {
		String email = UUID.randomUUID() + "@example.com";
		String auth = body(exchange(loginCode("kakao", email, true), VERIFIER).andExpect(status().isOk()));
		String token = JsonPath.read(auth, "$.accessToken");
		Number id = JsonPath.read(auth, "$.user.id");
		json("/api/v1/auth/login", """
				{"email":"%s","password":"abcd1234"}
				""".formatted(email))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("SOCIAL_ACCOUNT")))
			.andExpect(jsonPath("$.provider", is("kakao"))).andExpect(jsonPath("$.message", is("카카오로 가입한 계정이에요. 카카오로 로그인해 주세요")));
		json("/api/v1/auth/signup", """
				{"email":"%s","password":"abcd1234","agreeTerms":true,"agreePrivacy":true}
				""".formatted(email))
			.andExpect(status().isConflict()).andExpect(jsonPath("$.code", is("EMAIL_UNAVAILABLE")));
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.confirm", is("확인 문구 '탈퇴'를 입력해 주세요")));
		doThrow(new IllegalStateException("fake unlink failure")).when(provider).unlinkKakao(anyString());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content("""
				{"confirm":"탈퇴"}
				"""))
			.andExpect(status().isNoContent());
		verify(provider).unlinkKakao(anyString());
		assertEquals(0, jdbc.queryForObject("select count(*) from user_identities where user_id=?", Integer.class, id));
		assertEquals(0, jdbc.queryForObject("select count(*) from users where id=?", Integer.class, id));
		mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token)).andExpect(status().isUnauthorized());
	}

	/** 카카오 연결 끊기는 탈퇴가 커밋된 뒤에 보낸다(웹 회원 행이 이미 지워진 상태). */
	@Test
	void kakaoUnlinkRunsAfterWithdrawalIsCommitted() throws Exception {
		String auth = body(exchange(loginCode("kakao", UUID.randomUUID() + "@example.com", true), VERIFIER).andExpect(status().isOk()));
		String token = JsonPath.read(auth, "$.accessToken");
		Number id = JsonPath.read(auth, "$.user.id");
		int[] usersAtUnlink = { -1 };
		doAnswer(inv -> {
			usersAtUnlink[0] = jdbc.queryForObject("select count(*) from users where id=?", Integer.class, id);
			return null;
		}).when(provider).unlinkKakao(anyString());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"confirm\":\"탈퇴\"}"))
			.andExpect(status().isNoContent());
		verify(provider).unlinkKakao(anyString());
		assertEquals(0, usersAtUnlink[0]);
	}

	/** 탈퇴가 롤백되면 카카오 연결도 끊지 않는다. */
	@Test
	void failedWithdrawalDoesNotUnlinkKakao() throws Exception {
		String auth = body(exchange(loginCode("kakao", UUID.randomUUID() + "@example.com", true), VERIFIER).andExpect(status().isOk()));
		String token = JsonPath.read(auth, "$.accessToken");
		Number id = JsonPath.read(auth, "$.user.id");
		FailingWithdrawalConfig.failFor = id.longValue();
		try {
			mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
				.content("{\"confirm\":\"탈퇴\"}"))
				.andExpect(status().isInternalServerError());
		}
		finally {
			FailingWithdrawalConfig.failFor = -1;
		}
		verify(provider, never()).unlinkKakao(anyString());
		assertEquals(1, jdbc.queryForObject("select count(*) from users where id=?", Integer.class, id));
		assertEquals(1, jdbc.queryForObject("select count(*) from user_identities where user_id=?", Integer.class, id));
	}

	@Test
	void emailAccountStillRequiresPasswordToDelete() throws Exception {
		String email = UUID.randomUUID() + "@example.com";
		String auth = body(json("/api/v1/auth/signup", """
				{"email":"%s","password":"abcd1234","agreeTerms":true,"agreePrivacy":true}
				""".formatted(email)).andExpect(status().isCreated())
			.andExpect(jsonPath("$.user.provider", is("email"))).andExpect(jsonPath("$.user.hasPassword", is(true))));
		String token = JsonPath.read(auth, "$.accessToken");
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("""
				{"confirm":"탈퇴"}
				"""))
			.andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.password").exists());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("""
				{"password":"wrong1234"}
				"""))
			.andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code", is("INVALID_CREDENTIALS")));
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("""
				{"password":"abcd1234"}
				"""))
			.andExpect(status().isNoContent());
	}
}
