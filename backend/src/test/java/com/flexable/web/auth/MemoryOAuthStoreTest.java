package com.flexable.web.auth;

import static org.junit.jupiter.api.Assertions.assertNotNull;
import static org.junit.jupiter.api.Assertions.assertNull;
import static org.mockito.ArgumentMatchers.any;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.redirectedUrl;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.Clock;
import java.util.List;
import org.junit.jupiter.api.Test;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.setup.MockMvcBuilders;
import org.springframework.web.util.UriComponentsBuilder;

class MemoryOAuthStoreTest {
	@Test
	void capacityRejectsStartAndCallbackWithFailedRedirect() throws Exception {
		String redirectUri = "flexable://oauth/callback";
		String challenge = "a".repeat(43);
		MemoryOAuthStore store = new MemoryOAuthStore(Clock.systemUTC(), 1, 1);
		OAuthProperties props = new OAuthProperties("http://localhost:8080", List.of(redirectUri),
				new OAuthProperties.Kakao("test-kakao", "", "", ""),
				new OAuthProperties.Google("test-google", ""));
		OAuthProviderClient provider = mock(OAuthProviderClient.class);
		when(provider.fetch("kakao", "provider-code"))
			.thenReturn(new OAuthProviderClient.Profile("provider-user", null, false));
		OAuthUserService users = mock(OAuthUserService.class);
		when(users.findOrCreate(eq("kakao"), any())).thenReturn(1L);
		OAuthService oauth = new OAuthService(props, store, provider, users, mock(AuthService.class));
		MockMvc mvc = MockMvcBuilders.standaloneSetup(new OAuthController(oauth)).build();

		String location = mvc.perform(get("/api/v1/auth/oauth/kakao/start")
			.param("redirectUri", redirectUri).param("codeChallenge", challenge))
			.andExpect(status().isFound()).andReturn().getResponse().getHeader("Location");
		mvc.perform(get("/api/v1/auth/oauth/kakao/start")
			.param("redirectUri", redirectUri).param("codeChallenge", challenge))
			.andExpect(status().isFound()).andExpect(redirectedUrl(redirectUri + "?error=failed"));

		String savedCode = store.saveCode(1L, challenge);
		assertNotNull(savedCode);
		assertNull(store.saveCode(1L, challenge));
		String state = UriComponentsBuilder.fromUriString(location).build().getQueryParams().getFirst("state");
		mvc.perform(get("/api/v1/auth/oauth/kakao/callback").param("state", state).param("code", "provider-code"))
			.andExpect(status().isFound()).andExpect(redirectedUrl(redirectUri + "?error=failed"));
		assertNotNull(store.consumeCode(savedCode));
		assertNotNull(store.saveCode(1L, challenge));
		assertNotNull(store.saveState("kakao", redirectUri, challenge));
	}
}
