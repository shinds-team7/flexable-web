package com.flexable.web.auth;

import static org.hamcrest.Matchers.endsWith;
import static org.junit.jupiter.api.Assertions.assertEquals;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.UUID;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

@SpringBootTest
@AutoConfigureMockMvc
class AuthFlowTest {

	private static final String PASSWORD = "password1";

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcTemplate jdbc;

	private static String email() {
		return "u" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
	}

	private ResultActions json(String path, String body) throws Exception {
		return mvc.perform(post(path).contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private String signup(String email) throws Exception {
		String body = json("/api/v1/auth/signup", """
				{"email":"%s","password":"%s","agreeTerms":true,"agreePrivacy":true}""".formatted(email, PASSWORD))
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		return JsonPath.read(body, "$.accessToken");
	}

	private ResultActions login(String email, String password) throws Exception {
		return json("/api/v1/auth/login", """
				{"email":"%s","password":"%s"}""".formatted(email, password));
	}

	private ResultActions me(String token) throws Exception {
		return mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token));
	}

	@Test
	void signupReturnsTokenAndMember() throws Exception {
		String email = email();
		json("/api/v1/auth/signup", """
				{"email":"%s","password":"%s","agreeTerms":true,"agreePrivacy":true}""".formatted(email.toUpperCase(), PASSWORD))
			.andExpect(status().isCreated())
			.andExpect(jsonPath("$.accessToken").isString())
			.andExpect(jsonPath("$.expiresAt", endsWith("+09:00")))
			.andExpect(jsonPath("$.user.email").value(email))
			.andExpect(jsonPath("$.user.createdAt", endsWith("+09:00")));
		login(email, PASSWORD).andExpect(status().isOk()).andExpect(jsonPath("$.user.email").value(email));
	}

	@Test
	void signupRequiresConsentAndPasswordRules() throws Exception {
		json("/api/v1/auth/signup", """
				{"email":"%s","password":"%s","agreeTerms":false,"agreePrivacy":true}""".formatted(email(), PASSWORD))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.code").value("VALIDATION_FAILED"))
			.andExpect(jsonPath("$.fields.agreeTerms").exists());
		json("/api/v1/auth/signup", """
				{"email":"%s","password":"onlyletters","agreeTerms":true,"agreePrivacy":true}""".formatted(email()))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.password").exists());
	}

	@Test
	void duplicateEmailIsRejected() throws Exception {
		String email = email();
		signup(email);
		json("/api/v1/auth/signup", """
				{"email":"%s","password":"%s","agreeTerms":true,"agreePrivacy":true}""".formatted(email, PASSWORD))
			.andExpect(status().isConflict())
			.andExpect(jsonPath("$.code").value("EMAIL_UNAVAILABLE"));
	}

	@Test
	void wrongPasswordAndUnknownEmailLookTheSame() throws Exception {
		String email = email();
		signup(email);
		login(email, "wrongpass1").andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
		login(email(), PASSWORD).andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
	}

	@Test
	void loginIsLimitedAfterRepeatedFailures() throws Exception {
		String email = email();
		signup(email);
		for (int i = 0; i < LoginAttemptLimiter.MAX_FAILURES; i++) {
			login(email, "wrongpass1").andExpect(status().isUnauthorized());
		}
		login(email, PASSWORD).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"))
			.andExpect(jsonPath("$.retryAfterSeconds").isNumber());
	}

	@Test
	void logoutRevokesEveryWebToken() throws Exception {
		String email = email();
		String first = signup(email);
		String second = JsonPath.read(login(email, PASSWORD).andReturn().getResponse().getContentAsString(), "$.accessToken");
		me(first).andExpect(status().isOk());
		mvc.perform(post("/api/v1/auth/logout").header("Authorization", "Bearer " + second))
			.andExpect(status().isNoContent());
		me(first).andExpect(status().isUnauthorized()).andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
		me(second).andExpect(status().isUnauthorized());
		String third = JsonPath.read(login(email, PASSWORD).andReturn().getResponse().getContentAsString(), "$.accessToken");
		me(third).andExpect(status().isOk());
	}

	@Test
	void withdrawNeedsPasswordThenDeletesEverything() throws Exception {
		String email = email();
		String token = signup(email);
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{}"))
			.andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.password").exists());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"wrongpass1\"}"))
			.andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("INVALID_CREDENTIALS"));
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"%s\"}".formatted(PASSWORD)))
			.andExpect(status().isNoContent());

		me(token).andExpect(status().isUnauthorized());
		login(email, PASSWORD).andExpect(status().isUnauthorized());
		Integer rows = jdbc.queryForObject("SELECT COUNT(*) FROM members WHERE email = ?", Integer.class, email);
		assertEquals(0, rows);
		// 같은 이메일로 다시 가입할 수 있다.
		signup(email);
	}

	@Test
	void protectedPathsNeedToken() throws Exception {
		mvc.perform(get("/api/v1/me")).andExpect(status().isUnauthorized())
			.andExpect(jsonPath("$.code").value("UNAUTHORIZED"));
		mvc.perform(get("/api/v1/me").header("Authorization", "Bearer not-a-jwt"))
			.andExpect(status().isUnauthorized());
		mvc.perform(get("/api/v1/health")).andExpect(status().isOk()).andExpect(jsonPath("$.status").value("UP"));
	}

	/** 다른 키(예: 앱 서버 키)로 서명한 토큰은 같은 sub·tv여도 통과하지 못한다. iss 검사는 TokenServiceTest. */
	@Test
	void tokenSignedWithAnotherKeyIsRejected() throws Exception {
		String token = signup(email());
		long id = ((Number) JsonPath.read(me(token).andReturn().getResponse().getContentAsString(), "$.id")).longValue();
		me(TokenServiceTest.sign(String.valueOf(id), "another-server-secret-another-server-secret", TokenService.ISSUER))
			.andExpect(status().isUnauthorized());
	}
}
