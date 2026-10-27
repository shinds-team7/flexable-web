package com.flexable.web.seedmoney;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.mockito.ArgumentMatchers.anyLong;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.ArgumentMatchers.eq;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
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

import com.flexable.web.applink.AppApiClient;
import com.flexable.web.applink.AppApiClient.AppProfile;
import com.flexable.web.applink.AppApiClient.AppSeedMoney;
import com.flexable.web.applink.AppApiClient.CreatedLink;
import com.flexable.web.applink.AppApiClient.LastEntry;
import com.flexable.web.applink.AppApiException;
import com.flexable.web.applink.AppApiException.Kind;
import com.jayway.jsonpath.JsonPath;

/** PUT·DELETE /api/v1/me/seed-money/manual(decisions 2026-10-24 ②). 앱 서버는 AppApiClient를 바꿔 끼워 흉내 낸다. */
@SpringBootTest
@AutoConfigureMockMvc
class SeedMoneyManualApiTest {

	private static final String PASSWORD = "password1";
	private static final OffsetDateTime AT = OffsetDateTime.parse("2026-09-25T20:10:00+09:00");

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcTemplate jdbc;
	@MockitoBean
	AppApiClient app;

	private String token;
	private long userId;

	@BeforeEach
	void setup() throws Exception {
		reset(app);
		when(app.enabled()).thenReturn(true);
		when(app.create(anyString())).thenReturn(new CreatedLink("link-" + UUID.randomUUID(), new AppProfile(null, "kakao")));
		when(app.profile(anyString())).thenReturn(new AppProfile(null, "kakao"));
		when(app.seedMoney(anyString())).thenReturn(new AppSeedMoney(1_450_000, 500_000, 300_000,
				new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 950_000, AT), AT, LocalDate.parse("2026-06-26"), List.of()));
		token = signup();
		String me = mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token))
			.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		userId = ((Number) JsonPath.read(me, "$.id")).longValue();
	}

	private String signup() throws Exception {
		String email = "seed-" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
		String body = mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"%s\",\"password\":\"%s\",\"agreeTerms\":true}".formatted(email, PASSWORD)))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		return JsonPath.read(body, "$.accessToken");
	}

	private ResultActions lookup(String t) throws Exception {
		return mvc.perform(get("/api/v1/me/seed-money").header("Authorization", "Bearer " + t));
	}

	private ResultActions save(String t, String body) throws Exception {
		return mvc.perform(put("/api/v1/me/seed-money/manual").header("Authorization", "Bearer " + t)
			.contentType(MediaType.APPLICATION_JSON).content(body));
	}

	private ResultActions resetManual(String t) throws Exception {
		return mvc.perform(delete("/api/v1/me/seed-money/manual").header("Authorization", "Bearer " + t));
	}

	private int rows() {
		return jdbc.queryForObject("SELECT COUNT(*) FROM seed_money_manual WHERE user_id = ?", Integer.class, userId);
	}

	@Test
	void saveOverwriteAndResetAreKeptPerMember() throws Exception {
		lookup(token).andExpect(status().isOk()).andExpect(jsonPath("$.source").value("none")).andExpect(jsonPath("$.manual").isEmpty());

		save(token, "{\"total\":470000}").andExpect(status().isOk())
			.andExpect(jsonPath("$.source").value("none"))
			.andExpect(jsonPath("$.manual.total").value(470_000))
			.andExpect(jsonPath("$.manual.updatedAt", endsWith("+09:00")));
		save(token, "{\"total\":0}").andExpect(status().isOk()).andExpect(jsonPath("$.manual.total").value(0));
		lookup(token).andExpect(jsonPath("$.manual.total").value(0));
		assertThat(rows()).isEqualTo(1);

		lookup(signup()).andExpect(jsonPath("$.manual").isEmpty());

		resetManual(token).andExpect(status().isNoContent());
		lookup(token).andExpect(jsonPath("$.manual").isEmpty());
		resetManual(token).andExpect(status().isNoContent());
		assertThat(rows()).isZero();
	}

	private void linkApp() throws Exception {
		mvc.perform(post("/api/v1/app-link").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"K7M2Q9\"}")).andExpect(status().isCreated());
	}

	/** #83: 연동 회원이 고치면 앱에 반영하고, 성공하면 웹 직접 수정값을 지우고 앱이 돌려준 값을 쓴다. */
	@Test
	void linkedMemberEditIsAppliedToAppAndManualIsCleared() throws Exception {
		linkApp();
		when(app.updateSeedMoney(anyString(), eq(2_000_000L))).thenReturn(new AppSeedMoney(2_000_000, 1_050_000, 300_000,
				new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 950_000, AT), AT, LocalDate.parse("2026-06-26"), List.of()));
		save(token, "{\"total\":2000000}").andExpect(status().isOk())
			.andExpect(jsonPath("$.source").value("app"))
			.andExpect(jsonPath("$.total").value(2_000_000))
			.andExpect(jsonPath("$.base").value(1_050_000))
			.andExpect(jsonPath("$.manual").isEmpty())
			.andExpect(jsonPath("$.appSync.status").value("applied"));
		verify(app).updateSeedMoney(anyString(), eq(2_000_000L));
		assertThat(rows()).isZero();
		lookup(token).andExpect(jsonPath("$.total").value(2_000_000)).andExpect(jsonPath("$.appSync").isEmpty());
	}

	/** 앱이 거절하거나 닿지 않으면 웹에만 저장하고 안내한다. 연동 값(앱 값)은 그대로다. */
	@Test
	void linkedMemberEditIsKeptOnWebWhenAppFails() throws Exception {
		linkApp();
		when(app.updateSeedMoney(anyString(), anyLong()))
			.thenThrow(new AppApiException(Kind.REJECTED, "앱에서 반영한 돈(950,000원)보다 작게 고칠 수 없어요"));
		save(token, "{\"total\":100000}").andExpect(status().isOk())
			.andExpect(jsonPath("$.total").value(1_450_000))
			.andExpect(jsonPath("$.manual.total").value(100_000))
			.andExpect(jsonPath("$.appSync.status").value("failed"))
			.andExpect(jsonPath("$.appSync.message").value("앱에서 반영한 돈(950,000원)보다 작게 고칠 수 없어요. 웹에만 저장했어요"));

		reset(app);
		when(app.updateSeedMoney(anyString(), anyLong())).thenThrow(new AppApiException(Kind.UNAVAILABLE));
		save(token, "{\"total\":2000000}").andExpect(jsonPath("$.manual.total").value(2_000_000))
			.andExpect(jsonPath("$.appSync.status").value("failed"))
			.andExpect(jsonPath("$.appSync.message").exists());

		// 앱에서 이미 해제된 연동이면 웹 연동을 정리하고 웹에만 저장한다.
		reset(app);
		when(app.updateSeedMoney(anyString(), anyLong())).thenThrow(new AppApiException(Kind.LINK_NOT_FOUND));
		save(token, "{\"total\":3000000}").andExpect(jsonPath("$.source").value("none"))
			.andExpect(jsonPath("$.manual.total").value(3_000_000))
			.andExpect(jsonPath("$.appSync.status").value("failed"));
	}

	@Test
	void unlinkedMemberEditStaysOnWebWithoutCallingApp() throws Exception {
		save(token, "{\"total\":2000000}").andExpect(jsonPath("$.appSync").isEmpty());
		verify(app, never()).updateSeedMoney(anyString(), anyLong());
	}

	@Test
	void rejectsOutOfRangeDecimalAndMissingAmounts() throws Exception {
		for (String body : List.of("{\"total\":-1}", "{\"total\":1000000001}", "{}", "{\"total\":null}", "{\"total\":1.5}",
				"{\"total\":\"470000\"}")) {
			save(token, body).andExpect(status().isBadRequest()).andExpect(jsonPath("$.code").value("VALIDATION_FAILED"));
		}
		save(token, "{\"total\":1000000000}").andExpect(status().isOk());
	}

	@Test
	void requiresLoginAndIsDeletedOnWithdrawal() throws Exception {
		mvc.perform(get("/api/v1/me/seed-money")).andExpect(status().isUnauthorized());
		mvc.perform(put("/api/v1/me/seed-money/manual").contentType(MediaType.APPLICATION_JSON).content("{\"total\":1}"))
			.andExpect(status().isUnauthorized());
		mvc.perform(delete("/api/v1/me/seed-money/manual")).andExpect(status().isUnauthorized());

		save(token, "{\"total\":470000}").andExpect(status().isOk());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"%s\"}".formatted(PASSWORD)))
			.andExpect(status().isNoContent());
		assertThat(rows()).isZero();
	}
}
