package com.flexable.web.applink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.endsWith;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.doReturn;
import static org.mockito.Mockito.doThrow;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.ExecutorService;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.extension.ExtendWith;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.test.system.CapturedOutput;
import org.springframework.boot.test.system.OutputCaptureExtension;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.MvcResult;
import org.springframework.test.web.servlet.ResultActions;

import com.flexable.web.applink.AppApiClient.AppProfile;
import com.flexable.web.applink.AppApiClient.AppSeedMoney;
import com.flexable.web.applink.AppApiClient.CreatedLink;
import com.flexable.web.applink.AppApiClient.Entry;
import com.flexable.web.applink.AppApiClient.LastEntry;
import com.flexable.web.applink.AppApiException.Kind;
import com.jayway.jsonpath.JsonPath;

/** 웹 /api/v1/app-link 흐름. 앱 서버는 AppApiClient를 바꿔 끼워 흉내 낸다(실제 HTTP는 RestAppApiClientTest). */
@SpringBootTest
@AutoConfigureMockMvc
@ExtendWith(OutputCaptureExtension.class)
class AppLinkFlowTest {

	private static final String CODE = "K7M2Q9";
	private static final AppProfile PROFILE = new AppProfile(null, "kakao");
	private static final AppSeedMoney SEED = new AppSeedMoney(1_450_000, 500_000, 300_000,
			new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 950_000, OffsetDateTime.parse("2026-09-25T20:10:00+09:00")),
			OffsetDateTime.parse("2026-09-25T20:10:00+09:00"));

	@Autowired
	MockMvc mvc;
	@Autowired
	JdbcTemplate jdbc;
	@MockitoBean
	AppApiClient app;
	@Autowired
	AppLinkService appLinks;

	private String linkId;

	@BeforeEach
	void setup() {
		reset(app);
		linkId = "link-" + UUID.randomUUID() + "-secret";
		when(app.enabled()).thenReturn(true);
		when(app.create(anyString())).thenReturn(new CreatedLink(linkId, PROFILE));
		when(app.profile(anyString())).thenReturn(PROFILE);
		when(app.seedMoney(anyString())).thenReturn(SEED);
	}

	private String signup() throws Exception {
		String email = "u" + UUID.randomUUID().toString().substring(0, 8) + "@example.com";
		String body = mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON).content("""
				{"email":"%s","password":"password1","agreeTerms":true,"agreePrivacy":true}""".formatted(email)))
			.andExpect(status().isCreated())
			.andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		return JsonPath.read(body, "$.accessToken");
	}

	private long userId(String token) throws Exception {
		String body = mvc.perform(get("/api/v1/me").header("Authorization", "Bearer " + token))
			.andReturn().getResponse().getContentAsString();
		return ((Number) JsonPath.read(body, "$.id")).longValue();
	}

	private ResultActions link(String token, String code) throws Exception {
		return mvc.perform(post("/api/v1/app-link").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"code\":\"%s\"}".formatted(code)));
	}

	private ResultActions lookup(String token) throws Exception {
		return mvc.perform(get("/api/v1/app-link").header("Authorization", "Bearer " + token));
	}

	private ResultActions unlink(String token) throws Exception {
		return mvc.perform(delete("/api/v1/app-link").header("Authorization", "Bearer " + token));
	}

	private int rows(long userId) {
		return jdbc.queryForObject("SELECT COUNT(*) FROM app_links WHERE user_id = ?", Integer.class, userId);
	}

	@Test
	void linkShowsAccountAndSeedMoneyThenUnlinks() throws Exception {
		String token = signup();
		lookup(token).andExpect(status().isOk()).andExpect(jsonPath("$.linked").value(false))
			.andExpect(jsonPath("$.enabled").value(true));

		MvcResult created = link(token, CODE).andExpect(status().isCreated())
			.andExpect(jsonPath("$.linked").value(true))
			.andExpect(jsonPath("$.linkedAt", endsWith("+09:00")))
			.andExpect(jsonPath("$.account.email").isEmpty())
			.andExpect(jsonPath("$.account.provider").value("kakao"))
			.andExpect(jsonPath("$.seedMoney.status").value("available"))
			.andExpect(jsonPath("$.seedMoney.total").value(1_450_000))
			.andExpect(jsonPath("$.seedMoney.base").value(500_000))
			.andExpect(jsonPath("$.seedMoney.monthlyGoal").value(300_000))
			.andExpect(jsonPath("$.seedMoney.lastEntry.cycleEnd").value("2026-09-25"))
			.andExpect(jsonPath("$.seedMoney.lastEntry.choice").value("ALL"))
			.andExpect(jsonPath("$.seedMoney.updatedAt", endsWith("+09:00")))
			.andExpect(jsonPath("$.sync.status").value("fresh"))
			.andReturn();
		verify(app).create(CODE);

		// linkId는 응답에도 DB 평문으로도 남지 않는다.
		assertThat(created.getResponse().getContentAsString()).doesNotContain(linkId);
		String stored = jdbc.queryForObject("SELECT link_id_cipher FROM app_links WHERE user_id = ?", String.class,
				userId(token));
		assertThat(stored).startsWith("v1:").doesNotContain(linkId);

		lookup(token).andExpect(jsonPath("$.linked").value(true)).andExpect(jsonPath("$.seedMoney.total").value(1_450_000));
		verify(app, times(2)).profile(linkId);

		unlink(token).andExpect(status().isNoContent());
		verify(app).delete(linkId);
		lookup(token).andExpect(jsonPath("$.linked").value(false));
		// 연동이 없을 때 해제는 아무것도 하지 않는다.
		unlink(token).andExpect(status().isNoContent());
		verify(app, times(1)).delete(anyString());
	}

	@Test
	void invalidCodeIsCountedPerWebUser() throws Exception {
		String token = signup();
		when(app.create(anyString())).thenThrow(new AppApiException(Kind.CODE_INVALID));
		for (int i = 0; i < AppLinkService.MAX_CODE_FAILURES; i++) {
			link(token, "AAAAAA").andExpect(status().isBadRequest())
				.andExpect(jsonPath("$.code").value("LINK_CODE_INVALID"));
		}
		link(token, CODE).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"))
			.andExpect(jsonPath("$.retryAfterSeconds").isNumber());
		verify(app, times(AppLinkService.MAX_CODE_FAILURES)).create(anyString());
		assertThat(rows(userId(token))).isZero();

		// 다른 웹 회원은 영향받지 않는다.
		link(signup(), "AAAAAA").andExpect(status().isBadRequest());
	}

	@Test
	void malformedCodeIsRejectedBeforeCallingApp() throws Exception {
		String token = signup();
		link(token, "").andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.code").exists());
		link(token, "<script>").andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields.code").exists());
		verify(app, never()).create(anyString());
	}

	@Test
	void appRateLimitIsPassedThrough() throws Exception {
		when(app.create(anyString())).thenThrow(new AppApiException(Kind.RATE_LIMITED, 120));
		link(signup(), CODE).andExpect(status().isTooManyRequests())
			.andExpect(jsonPath("$.code").value("TOO_MANY_ATTEMPTS"))
			.andExpect(jsonPath("$.retryAfterSeconds").value(120));
	}

	@Test
	void unknownResultIsNotRetriedOrShownAsSuccess() throws Exception {
		String token = signup();
		when(app.create(anyString())).thenThrow(new AppApiException(Kind.RESULT_UNKNOWN));
		link(token, CODE).andExpect(status().isBadGateway())
			.andExpect(jsonPath("$.code").value("APP_LINK_RESULT_UNKNOWN"));
		verify(app, times(1)).create(anyString());
		lookup(token).andExpect(jsonPath("$.linked").value(false));
	}

	@Test
	void appOutageOrServiceKeyErrorOnLink() throws Exception {
		String token = signup();
		when(app.create(anyString())).thenThrow(new AppApiException(Kind.UNAVAILABLE));
		link(token, CODE).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("APP_UNAVAILABLE"));
		reset(app);
		when(app.create(anyString())).thenThrow(new AppApiException(Kind.AUTH_FAILED));
		link(token, CODE).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("APP_UNAVAILABLE"));
		assertThat(rows(userId(token))).isZero();
	}

	@Test
	void secondLinkIsRejectedWithoutConsumingTheCode() throws Exception {
		String token = signup();
		link(token, CODE).andExpect(status().isCreated());
		link(token, "ABCD-EFGH").andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("APP_LINK_EXISTS"));
		verify(app, times(1)).create(anyString());
	}

	@Test
	void otherUsersCannotSeeOrRemoveTheLink() throws Exception {
		String owner = signup();
		link(owner, CODE).andExpect(status().isCreated());
		String other = signup();
		lookup(other).andExpect(jsonPath("$.linked").value(false));
		unlink(other).andExpect(status().isNoContent());
		verify(app, never()).delete(anyString());
		lookup(owner).andExpect(jsonPath("$.linked").value(true));
		mvc.perform(get("/api/v1/app-link")).andExpect(status().isUnauthorized());
	}

	@Test
	void unlinkedInAppIsCleanedUpOnNextLookup() throws Exception {
		String token = signup();
		link(token, CODE).andExpect(status().isCreated());
		when(app.profile(anyString())).thenThrow(new AppApiException(Kind.LINK_NOT_FOUND));
		lookup(token).andExpect(jsonPath("$.linked").value(false)).andExpect(jsonPath("$.reason").value("app_unlinked"));
		assertThat(rows(userId(token))).isZero();
		lookup(token).andExpect(jsonPath("$.linked").value(false)).andExpect(jsonPath("$.reason").isEmpty());
	}

	/** 주기별 반영 기록은 조회마다 통째로 바뀌고, /me/seed-money로 그대로 나가며, 해제하면 함께 지워진다. */
	@Test
	void seedEntriesAreReplacedAndServedAsSeedMoney() throws Exception {
		String token = signup();
		mvc.perform(get("/api/v1/me/seed-money").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk()).andExpect(jsonPath("$.source").value("none")).andExpect(jsonPath("$.total").isEmpty());

		OffsetDateTime at = OffsetDateTime.parse("2026-09-25T20:10:00+09:00");
		when(app.seedMoney(anyString())).thenReturn(new AppSeedMoney(1_450_000, 500_000, 300_000,
				new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 650_000, at), at, LocalDate.parse("2026-06-26"),
				List.of(new Entry(LocalDate.parse("2026-07-25"), "GOAL", 300_000, 800_000, at),
						new Entry(LocalDate.parse("2026-08-25"), "MANUAL", 0, 800_000, at),
						new Entry(LocalDate.parse("2026-09-25"), "ALL", 650_000, 1_450_000, at))));
		link(token, CODE).andExpect(status().isCreated())
			.andExpect(jsonPath("$.seedMoney.startedOn").value("2026-06-26"))
			.andExpect(jsonPath("$.seedMoney.entries.length()").value(3));
		long linkRow = jdbc.queryForObject("SELECT id FROM app_links WHERE user_id = ?", Long.class, userId(token));

		mvc.perform(get("/api/v1/me/seed-money").header("Authorization", "Bearer " + token))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.source").value("app"))
			.andExpect(jsonPath("$.status").value("available"))
			.andExpect(jsonPath("$.total").value(1_450_000))
			.andExpect(jsonPath("$.base").value(500_000))
			.andExpect(jsonPath("$.startedOn").value("2026-06-26"))
			.andExpect(jsonPath("$.entries[0].cycleEnd").value("2026-07-25"))
			.andExpect(jsonPath("$.entries[1].amount").value(0))
			.andExpect(jsonPath("$.entries[2].totalAfter").value(1_450_000))
			.andExpect(jsonPath("$.entries[2].createdAt", endsWith("+09:00")))
			.andExpect(jsonPath("$.sync.status").value("fresh"));

		// 모아둔 돈을 고치면 앱이 누적값을 다시 계산해 준다. 웹은 받은 대로 바꾼다.
		when(app.seedMoney(anyString())).thenReturn(new AppSeedMoney(1_550_000, 600_000, 300_000,
				new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 650_000, at), at, LocalDate.parse("2026-06-26"),
				List.of(new Entry(LocalDate.parse("2026-09-25"), "ALL", 950_000, 1_550_000, at))));
		lookup(token).andExpect(jsonPath("$.seedMoney.entries.length()").value(1))
			.andExpect(jsonPath("$.seedMoney.entries[0].totalAfter").value(1_550_000));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_link_entries WHERE app_link_id = ?", Integer.class, linkRow))
			.isEqualTo(1);

		// 예산 설정 전으로 바뀌면 기록도 지운다
		when(app.seedMoney(anyString())).thenThrow(new AppApiException(Kind.BUDGET_NOT_SET));
		lookup(token).andExpect(jsonPath("$.seedMoney.status").value("budget_not_set"))
			.andExpect(jsonPath("$.seedMoney.entries").isEmpty());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_link_entries WHERE app_link_id = ?", Integer.class, linkRow))
			.isZero();

		reset(app);
		when(app.enabled()).thenReturn(true);
		when(app.profile(anyString())).thenReturn(PROFILE);
		when(app.seedMoney(anyString())).thenReturn(new AppSeedMoney(1_450_000, 500_000, 300_000, null, at,
				LocalDate.parse("2026-06-26"), List.of(new Entry(LocalDate.parse("2026-07-25"), "GOAL", 300_000, 800_000, at))));
		lookup(token).andExpect(jsonPath("$.seedMoney.entries.length()").value(1));
		unlink(token).andExpect(status().isNoContent());
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM app_link_entries WHERE app_link_id = ?", Integer.class, linkRow))
			.isZero();
		mvc.perform(get("/api/v1/me/seed-money").header("Authorization", "Bearer " + token))
			.andExpect(jsonPath("$.source").value("none"));
	}

	/** 웹에 다시 들어오지 않아도 매일 확인에서 앱 해제를 알아 웹 연동 정보를 지운다. 다른 회원의 연동과 앱 장애는 그대로 둔다. */
	@Test
	void dailyRecheckRemovesLinksUnlinkedInApp() throws Exception {
		String gone = signup();
		String kept = signup();
		link(gone, CODE).andExpect(status().isCreated());
		when(app.create(anyString())).thenReturn(new CreatedLink(linkId + "-2", PROFILE));
		link(kept, CODE).andExpect(status().isCreated());
		when(app.profile(linkId)).thenThrow(new AppApiException(Kind.LINK_NOT_FOUND));
		when(app.profile(linkId + "-2")).thenThrow(new AppApiException(Kind.UNAVAILABLE));

		assertThat(appLinks.recheckAll()).isGreaterThanOrEqualTo(1);
		assertThat(rows(userId(gone))).isZero();
		assertThat(rows(userId(kept))).isEqualTo(1);
	}

	@Test
	void budgetNotSetKeepsTheLink() throws Exception {
		String token = signup();
		when(app.seedMoney(anyString())).thenThrow(new AppApiException(Kind.BUDGET_NOT_SET));
		link(token, CODE).andExpect(status().isCreated())
			.andExpect(jsonPath("$.linked").value(true))
			.andExpect(jsonPath("$.seedMoney.status").value("budget_not_set"))
			.andExpect(jsonPath("$.seedMoney.total").isEmpty())
			.andExpect(jsonPath("$.sync.status").value("fresh"));
	}

	@Test
	void outageKeepsLastValuesAsStale(CapturedOutput output) throws Exception {
		String token = signup();
		link(token, CODE).andExpect(status().isCreated());
		when(app.profile(anyString())).thenThrow(new AppApiException(Kind.UNAVAILABLE));
		lookup(token).andExpect(status().isOk())
			.andExpect(jsonPath("$.linked").value(true))
			.andExpect(jsonPath("$.seedMoney.total").value(1_450_000))
			.andExpect(jsonPath("$.sync.status").value("stale"))
			.andExpect(jsonPath("$.sync.syncedAt", endsWith("+09:00")));
		assertThat(rows(userId(token))).isEqualTo(1);

		doReturn(PROFILE).when(app).profile(anyString());
		lookup(token).andExpect(jsonPath("$.sync.status").value("fresh"));
		assertThat(output.getAll()).doesNotContain(linkId);
	}

	@Test
	void outageRightAfterLinkShowsUnknownSeedMoney() throws Exception {
		when(app.seedMoney(anyString())).thenThrow(new AppApiException(Kind.UNAVAILABLE));
		link(signup(), CODE).andExpect(status().isCreated())
			.andExpect(jsonPath("$.seedMoney.status").value("not_received"))
			.andExpect(jsonPath("$.sync.status").value("stale"));
	}

	@Test
	void unlinkKeepsTheLinkWhenAppIsDown() throws Exception {
		String token = signup();
		link(token, CODE).andExpect(status().isCreated());
		doThrow(new AppApiException(Kind.UNAVAILABLE)).when(app).delete(anyString());
		unlink(token).andExpect(status().isServiceUnavailable()).andExpect(jsonPath("$.code").value("APP_UNAVAILABLE"));
		assertThat(rows(userId(token))).isEqualTo(1);

		// 앱에서 이미 해제됐으면 웹도 정리한다.
		doThrow(new AppApiException(Kind.LINK_NOT_FOUND)).when(app).delete(anyString());
		unlink(token).andExpect(status().isNoContent());
		assertThat(rows(userId(token))).isZero();
	}

	@Test
	void unreadableLinkCanStillBeRemovedOnTheWeb() throws Exception {
		String token = signup();
		long userId = userId(token);
		link(token, CODE).andExpect(status().isCreated());
		// 암호화 키가 바뀐 상황: 저장된 값을 읽을 수 없다.
		jdbc.update("UPDATE app_links SET link_id_cipher = 'v1:AAAAAAAAAAAAAAAAAAAAAAAAAAAAAAAA' WHERE user_id = ?", userId);
		lookup(token).andExpect(jsonPath("$.linked").value(true)).andExpect(jsonPath("$.sync.status").value("stale"));
		unlink(token).andExpect(status().isNoContent());
		verify(app, never()).delete(anyString());
		assertThat(rows(userId)).isZero();
	}

	@Test
	void failedSaveReleasesTheAppLink(CapturedOutput output) throws Exception {
		String token = signup();
		long userId = userId(token);
		// 앱 서버가 연동을 만든 사이 같은 회원의 연동이 저장됨(다른 서버·동시 요청) → 고유 키 위반
		when(app.create(anyString())).thenAnswer(inv -> {
			jdbc.update("""
					INSERT INTO app_links (user_id, link_id_cipher, app_provider, synced_at, checked_at, created_at)
					VALUES (?, 'v1:other', 'email', CURRENT_TIMESTAMP, CURRENT_TIMESTAMP, CURRENT_TIMESTAMP)""", userId);
			return new CreatedLink(linkId, PROFILE);
		});
		link(token, CODE).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("APP_LINK_EXISTS"));
		verify(app).delete(linkId);
		assertThat(output.getAll()).doesNotContain(linkId);
	}

	@Test
	void doubleSubmitIsRejectedWhileTheFirstIsRunning() throws Exception {
		String token = signup();
		CountDownLatch entered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		when(app.create(anyString())).thenAnswer(inv -> {
			entered.countDown();
			release.await(5, TimeUnit.SECONDS);
			return new CreatedLink(linkId, PROFILE);
		});
		ExecutorService pool = Executors.newSingleThreadExecutor();
		try {
			Future<MvcResult> first = pool.submit(() -> link(token, CODE).andReturn());
			assertThat(entered.await(5, TimeUnit.SECONDS)).isTrue();
			link(token, CODE).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("APP_LINK_IN_PROGRESS"));
			unlink(token).andExpect(status().isConflict()).andExpect(jsonPath("$.code").value("APP_LINK_IN_PROGRESS"));
			release.countDown();
			assertThat(first.get(10, TimeUnit.SECONDS).getResponse().getStatus()).isEqualTo(201);
		}
		finally {
			pool.shutdownNow();
		}
		verify(app, times(1)).create(anyString());
		assertThat(rows(userId(token))).isEqualTo(1);
	}

	@Test
	void withdrawalRemovesTheLinkAndReleasesItInApp() throws Exception {
		String token = signup();
		long userId = userId(token);
		link(token, CODE).andExpect(status().isCreated());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"password1\"}"))
			.andExpect(status().isNoContent());
		verify(app).delete(linkId);
		assertThat(rows(userId)).isZero();
	}

	@Test
	void withdrawalIsNotBlockedByAppOutage() throws Exception {
		String token = signup();
		long userId = userId(token);
		link(token, CODE).andExpect(status().isCreated());
		doThrow(new AppApiException(Kind.UNAVAILABLE)).when(app).delete(anyString());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"password1\"}"))
			.andExpect(status().isNoContent());
		assertThat(rows(userId)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM users WHERE id = ?", Integer.class, userId)).isZero();
	}

	@Test
	void failedWithdrawalDoesNotReleaseTheLink() throws Exception {
		String token = signup();
		link(token, CODE).andExpect(status().isCreated());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token)
			.contentType(MediaType.APPLICATION_JSON).content("{\"password\":\"wrongpass1\"}"))
			.andExpect(status().isUnauthorized());
		verify(app, never()).delete(anyString());
		assertThat(rows(userId(token))).isEqualTo(1);
	}
}
