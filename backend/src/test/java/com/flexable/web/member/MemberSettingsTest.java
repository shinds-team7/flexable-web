package com.flexable.web.member;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.endsWith;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.patch;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.util.UUID;
import java.util.stream.Collectors;
import java.util.stream.IntStream;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;

import com.jayway.jsonpath.JsonPath;

@SpringBootTest
@AutoConfigureMockMvc
class MemberSettingsTest {

	@Autowired
	MockMvc mvc;

	private String token;

	@BeforeEach
	void signup() throws Exception {
		String email = "s" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
		String body = mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content("""
				{"email":"%s","password":"password1","agreeTerms":true,"agreePrivacy":true}""".formatted(email)))
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		token = JsonPath.read(body, "$.accessToken");
	}

	private ResultActions patchSettings(String body) throws Exception {
		return mvc.perform(patch("/api/v1/me/settings").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	@Test
	void defaultsAreLightWithNothingSeen() throws Exception {
		mvc.perform(get("/api/v1/me/settings").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.theme").value("light"))
			.andExpect(jsonPath("$.seenTours").isEmpty())
			.andExpect(jsonPath("$.disclaimerAckAt", nullValue()));
	}

	@Test
	void patchChangesOnlySentFieldsAndMergesTours() throws Exception {
		patchSettings("{\"theme\":\"dark\",\"seenTours\":[\"home\",\"sim-intro\"]}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.theme").value("dark"))
			.andExpect(jsonPath("$.seenTours", contains("home", "sim-intro")));
		patchSettings("{\"seenTours\":[\"sim-intro\",\"savings\"],\"disclaimerAck\":true}")
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.theme").value("dark"))
			.andExpect(jsonPath("$.seenTours", contains("home", "sim-intro", "savings")))
			.andExpect(jsonPath("$.disclaimerAckAt", endsWith("+09:00")));
		mvc.perform(get("/api/v1/me/settings").header("Authorization", "Bearer " + token))
			.andExpect(jsonPath("$.seenTours", contains("home", "sim-intro", "savings")));
	}

	@Test
	void invalidValuesAreRejected() throws Exception {
		patchSettings("{\"theme\":\"system\"}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.theme").exists());
		patchSettings("{\"seenTours\":[\"Bad Key\"]}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.seenTours").exists());
	}

	@Test
	void storedToursAreCapped() throws Exception {
		String keys = IntStream.range(0, MemberSettings.MAX_SEEN_TOURS)
			.mapToObj(i -> "\"t" + i + "\"").collect(Collectors.joining(","));
		patchSettings("{\"seenTours\":[" + keys + "]}").andExpect(status().isOk());
		patchSettings("{\"seenTours\":[\"one-more\"]}").andExpect(status().isBadRequest())
			.andExpect(jsonPath("$.fields.seenTours").exists());
		patchSettings("{\"seenTours\":[\"t0\"]}").andExpect(status().isOk());
	}

	@Test
	void meReturnsProfile() throws Exception {
		mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.id").isNumber())
			.andExpect(jsonPath("$.email", endsWith("@example.com")))
			.andExpect(jsonPath("$.passwordHash").doesNotExist());
	}
}
