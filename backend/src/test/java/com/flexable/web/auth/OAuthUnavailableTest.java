package com.flexable.web.auth;

import static org.hamcrest.Matchers.hasSize;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;

@SpringBootTest
@AutoConfigureMockMvc
class OAuthUnavailableTest {
	@Autowired
	MockMvc mvc;
	@MockitoBean
	OAuthProviderClient provider;

	@Test
	void disabledProvidersAreHiddenAndStartReturnsUnavailable() throws Exception {
		mvc.perform(get("/api/v1/auth/oauth/providers")).andExpect(status().isOk())
			.andExpect(jsonPath("$.providers", hasSize(0)));
		for (String name : new String[] { "kakao", "google" }) {
			mvc.perform(get("/api/v1/auth/oauth/" + name + "/start")
				.param("redirectUri", "http://localhost:5173/oauth/callback").param("codeChallenge", "a".repeat(43)))
				.andExpect(status().isFound()).andExpect(redirectedUrl("http://localhost:5173/oauth/callback?error=provider_unavailable"));
		}
	}
}
