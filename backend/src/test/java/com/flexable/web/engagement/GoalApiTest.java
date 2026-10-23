package com.flexable.web.engagement;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.delete;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.put;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.charset.StandardCharsets;
import java.time.Instant;
import java.time.Clock;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.List;
import java.util.UUID;
import java.util.concurrent.CountDownLatch;
import java.util.concurrent.Executors;
import java.util.concurrent.Future;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.bean.override.mockito.MockitoBean;
import org.springframework.test.web.servlet.MockMvc;
import org.springframework.test.web.servlet.ResultActions;
import org.springframework.transaction.support.TransactionSynchronizationManager;
import org.springframework.transaction.PlatformTransactionManager;

import com.flexable.web.ai.GoalCoachClient;
import com.flexable.web.ai.GoalCoachClient.Result;
import com.flexable.web.applink.AppApiClient;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.engagement.GoalDtos.GoalInput;
import com.flexable.web.user.UserService;
import com.jayway.jsonpath.JsonPath;

@SpringBootTest(properties = "app.goal.coach.daily-cap=3")
@AutoConfigureMockMvc
class GoalApiTest {
	@Autowired MockMvc mvc;
	@Autowired JdbcTemplate jdbc;
	@Autowired GoalService goals;
	@Autowired UserService users;
	@Autowired PlatformTransactionManager transactions;
	@MockitoBean GoalCoachClient ai;
	@MockitoBean AppApiClient app;
	private String token;
	private long userId;
	private String due;
	private static final Result VALID = new Result(GoalCoachTextTest.raw("매달 {requiredMonthly}이 필요해요"), "fake-model", 100, 50);

	@BeforeEach
	void setup() throws Exception {
		reset(ai, app);
		when(ai.enabled()).thenReturn(true);
		when(ai.generate(anyString(), anyList())).thenReturn(VALID);
		jdbc.update("DELETE FROM ai_daily_usage");
		String response = mvc.perform(post("/api/v1/auth/signup").contentType(MediaType.APPLICATION_JSON)
			.content("{\"email\":\"goal-%s@example.com\",\"password\":\"password1\",\"agreeTerms\":true}".formatted(UUID.randomUUID())))
			.andExpect(status().isCreated()).andReturn().getResponse().getContentAsString(StandardCharsets.UTF_8);
		token = JsonPath.read(response, "$.accessToken");
		userId = ((Number) JsonPath.read(response, "$.user.id")).longValue();
		due = YearMonth.now(GoalCoachQuota.SEOUL).plusMonths(12).toString();
	}

	private ResultActions save(long amount, String name) throws Exception {
		return mvc.perform(put("/api/v1/me/goal").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"category\":\"EMERGENCY\",\"name\":\"%s\",\"amount\":%d,\"dueMonth\":\"%s\",\"currentAmount\":470000,\"monthlyPace\":78000}".formatted(name, amount, due)));
	}

	private ResultActions lookup() throws Exception {
		return mvc.perform(get("/api/v1/me/goal").header("Authorization", "Bearer " + token));
	}

	private ResultActions coach() throws Exception {
		return mvc.perform(post("/api/v1/me/goal/coach").header("Authorization", "Bearer " + token));
	}

	private int userUsage() {
		return jdbc.queryForObject("SELECT COALESCE(SUM(count), 0) FROM goal_coach_usage WHERE user_id = ?", Integer.class, userId);
	}

	private int globalUsage() {
		return jdbc.queryForObject("SELECT COALESCE(SUM(count), 0) FROM ai_daily_usage", Integer.class);
	}

	@Test
	void manualCrudIsIsolatedAndUnauthenticatedRequestsAreRejected() throws Exception {
		lookup().andExpect(status().isOk()).andExpect(jsonPath("$.goal").isEmpty()).andExpect(jsonPath("$.ai.limitPerDay").value(3));
		coach().andExpect(status().isNotFound());
		save(1000000, "  비상금  ").andExpect(status().isOk()).andExpect(jsonPath("$.goal.name").value("비상금"))
			.andExpect(jsonPath("$.goal.version").value(1)).andExpect(jsonPath("$.goal.seed.source").value("manual"))
			.andExpect(jsonPath("$.goal.progress.requiredMonthly").value(45000));
		assertThat(goals.get(users.register("other-%s@example.com".formatted(UUID.randomUUID()), Instant.now())).goal()).isNull();
		mvc.perform(delete("/api/v1/me/goal").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
		lookup().andExpect(jsonPath("$.goal").isEmpty());
		mvc.perform(delete("/api/v1/me/goal").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
		mvc.perform(get("/api/v1/me/goal")).andExpect(status().isUnauthorized());
		mvc.perform(put("/api/v1/me/goal").contentType(MediaType.APPLICATION_JSON).content("{}")).andExpect(status().isUnauthorized());
		mvc.perform(delete("/api/v1/me/goal")).andExpect(status().isUnauthorized());
		mvc.perform(post("/api/v1/me/goal/coach")).andExpect(status().isUnauthorized());
	}

	@Test
	void rejectsInvalidInputsAndAcceptsAmountBounds() throws Exception {
		for (String[] item : List.of(new String[] { "amount", "9999" }, new String[] { "amount", "1000000001" },
				new String[] { "category", "\"UNKNOWN\"" }, new String[] { "name", "\" \"" },
				new String[] { "name", "\"" + "가".repeat(21) + "\"" }, new String[] { "dueMonth", "\"2026-13\"" },
				new String[] { "dueMonth", "\"" + YearMonth.now(GoalCoachQuota.SEOUL) + "\"" },
				new String[] { "currentAmount", "-1" }, new String[] { "monthlyPace", "100000001" })) {
			String body = "{\"category\":\"OTHER\",\"name\":\"목표\",\"amount\":10000,\"dueMonth\":\"%s\",\"%s\":%s}".formatted(due, item[0], item[1]);
			mvc.perform(put("/api/v1/me/goal").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON).content(body))
				.andExpect(status().isBadRequest()).andExpect(jsonPath("$.fields." + item[0]).exists());
		}
		save(10000, "목표").andExpect(status().isOk());
		save(1000000000, "목표").andExpect(status().isOk());
		for (String invalidAmount : List.of("10000.9", "\"10000\"", "9223372036854775808")) {
			mvc.perform(put("/api/v1/me/goal").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
				.content("{\"category\":\"OTHER\",\"name\":\"목표\",\"amount\":%s,\"dueMonth\":\"%s\"}".formatted(invalidAmount, due)))
				.andExpect(status().isBadRequest());
		}
	}

	@Test
	void missingKeyReturnsFallbackWithoutCharging() throws Exception {
		when(ai.enabled()).thenReturn(false);
		save(1000000, "비상금");
		coach().andExpect(status().isOk()).andExpect(jsonPath("$.coach.aiGenerated").value(false))
			.andExpect(jsonPath("$.coach.fallbackReason").value("AI_UNAVAILABLE")).andExpect(jsonPath("$.coach.steps.length()").value(3))
			.andExpect(jsonPath("$.ai.remainingToday").value(3));
		assertThat(userUsage()).isZero();
		assertThat(globalUsage()).isZero();
	}

	@Test
	void cachesNumericFactsAndDoesNotSendIdentityOrName() throws Exception {
		save(1000000, "비밀목표명");
		coach().andExpect(status().isOk()).andExpect(jsonPath("$.coach.aiGenerated").value(true))
			.andExpect(jsonPath("$.coach.headline").value("매달 45,000원이 필요해요")).andExpect(jsonPath("$.ai.remainingToday").value(2));
		coach().andExpect(status().isOk()).andExpect(jsonPath("$.ai.remainingToday").value(2));
		save(1000000, "이름수정");
		lookup().andExpect(jsonPath("$.goal.coach.stale").value(false));
		coach().andExpect(status().isOk());
		ArgumentCaptor<String> facts = ArgumentCaptor.forClass(String.class);
		verify(ai, times(1)).generate(facts.capture(), anyList());
		assertThat(facts.getValue()).doesNotContain("비밀목표명", "이름수정", "email", "userId", "user_id", "requestedAt");
		save(2000000, "이름수정");
		lookup().andExpect(jsonPath("$.goal.coach.stale").value(true));
	}

	@Test
	void userLimitIncludesFailuresAndSurvivesGoalRecreation() throws Exception {
		when(ai.generate(anyString(), anyList())).thenThrow(new GoalCoachClient.Failed());
		save(1000000, "목표");
		for (int i = 0; i < 3; i++) {
			coach().andExpect(status().isOk()).andExpect(jsonPath("$.coach.fallbackReason").value("AI_FAILED"));
		}
		mvc.perform(delete("/api/v1/me/goal").header("Authorization", "Bearer " + token)).andExpect(status().isNoContent());
		save(1000000, "목표");
		coach().andExpect(status().isTooManyRequests()).andExpect(jsonPath("$.retryAfterSeconds").isNumber())
			.andExpect(jsonPath("$.plan").value("FREE")).andExpect(jsonPath("$.limitPerDay").value(3));
		assertThat(userUsage()).isEqualTo(3);
		assertThat(globalUsage()).isEqualTo(3);
		verify(ai, times(3)).generate(anyString(), anyList());
	}

	@Test
	void globalLimitRefundsUserReservation() throws Exception {
		jdbc.update("INSERT INTO ai_daily_usage (usage_date, count) VALUES (?, 3)", LocalDate.now(GoalCoachQuota.SEOUL));
		save(1000000, "목표");
		coach().andExpect(status().isOk()).andExpect(jsonPath("$.coach.fallbackReason").value("DAILY_CAP"))
			.andExpect(jsonPath("$.ai.remainingToday").value(3));
		assertThat(userUsage()).isZero();
		assertThat(globalUsage()).isEqualTo(3);
	}

	@Test
	void rejectedResponseFallsBackAndConsumesOneCall() throws Exception {
		when(ai.generate(anyString(), anyList())).thenReturn(new Result(GoalCoachTextTest.raw("999만원을 추천해요"), "fake", 1, 1));
		save(1000000, "목표");
		coach().andExpect(status().isOk()).andExpect(jsonPath("$.coach.fallbackReason").value("AI_REJECTED"));
		assertThat(userUsage()).isEqualTo(1);
	}

	@Test
	void linkedAppValuesOverrideManualAndUnavailableAppUsesManual() throws Exception {
		when(app.enabled()).thenReturn(true);
		when(app.create(anyString())).thenReturn(new AppApiClient.CreatedLink("test-link", new AppApiClient.AppProfile(null, "kakao")));
		when(app.profile(anyString())).thenReturn(new AppApiClient.AppProfile(null, "kakao"));
		when(app.seedMoney(anyString())).thenReturn(new AppApiClient.AppSeedMoney(600000, 0, 100000, null, OffsetDateTime.now()));
		mvc.perform(post("/api/v1/app-link").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"code\":\"K7M2Q9\"}")).andExpect(status().isCreated());
		save(1000000, "목표").andExpect(status().isOk()).andExpect(jsonPath("$.goal.seed.source").value("app"))
			.andExpect(jsonPath("$.goal.seed.current").value(600000)).andExpect(jsonPath("$.goal.seed.pace").value(100000));
		when(app.seedMoney(anyString())).thenThrow(new com.flexable.web.applink.AppApiException(com.flexable.web.applink.AppApiException.Kind.BUDGET_NOT_SET));
		lookup().andExpect(status().isOk()).andExpect(jsonPath("$.goal.seed.source").value("manual"))
			.andExpect(jsonPath("$.goal.seed.current").value(470000));
	}

	@Test
	void withdrawalDeletesPersonalTablesButKeepsGlobalCount() throws Exception {
		save(1000000, "목표");
		coach().andExpect(status().isOk());
		mvc.perform(delete("/api/v1/me").header("Authorization", "Bearer " + token).contentType(MediaType.APPLICATION_JSON)
			.content("{\"password\":\"password1\"}")).andExpect(status().isNoContent());
		for (String table : List.of("goals", "goal_coaches", "goal_coach_usage")) {
			assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId)).isZero();
		}
		assertThat(globalUsage()).isEqualTo(1);
	}

	@Test
	void modificationDeletionRecreationAndWithdrawalDuringCallDoNotSaveOldResponse() throws Exception {
		for (String action : List.of("modify", "delete", "recreate", "withdraw")) {
			// 회원 탈퇴는 마지막 반복에서 한다. 각 AI 호출에 사용된 횟수만 초기화한다.
			jdbc.update("DELETE FROM goal_coach_usage WHERE user_id = ?", userId);
			jdbc.update("DELETE FROM ai_daily_usage");
			save(1000000, "목표").andExpect(status().isOk());
			CountDownLatch entered = new CountDownLatch(1);
			CountDownLatch release = new CountDownLatch(1);
			when(ai.generate(anyString(), anyList())).thenAnswer(inv -> {
				assertThat(TransactionSynchronizationManager.isActualTransactionActive()).isFalse();
				entered.countDown();
				assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
				return VALID;
			});
			try (var pool = Executors.newSingleThreadExecutor()) {
				Future<?> pending = pool.submit(() -> goals.coach(userId));
				try {
					assertThat(entered.await(10, TimeUnit.SECONDS)).isTrue();
					switch (action) {
						case "modify" -> save(2000000, "수정").andExpect(status().isOk());
						case "delete" -> goals.delete(userId);
						case "recreate" -> { goals.delete(userId); save(1000000, "재생성").andExpect(status().isOk()); }
						case "withdraw" -> users.withdraw(userId);
					}
				}
				finally {
					release.countDown();
				}
				assertThatThrownBy(() -> pending.get(10, TimeUnit.SECONDS)).hasCauseInstanceOf(ApiException.class)
					.satisfies(e -> assertThat(((ApiException) e.getCause()).code()).isEqualTo(ErrorCode.GOAL_CHANGED));
			}
			assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_coaches WHERE user_id = ?", Integer.class, userId)).isZero();
		}
	}

	@Test
	void laterRequestWinsWhenEarlierResponseArrivesLast() throws Exception {
		save(1000000, "목표");
		CountDownLatch firstEntered = new CountDownLatch(1);
		CountDownLatch release = new CountDownLatch(1);
		AtomicInteger calls = new AtomicInteger();
		when(ai.generate(anyString(), anyList())).thenAnswer(inv -> {
			if (calls.incrementAndGet() == 1) {
				firstEntered.countDown();
				assertThat(release.await(10, TimeUnit.SECONDS)).isTrue();
				return new Result(GoalCoachTextTest.raw("먼저 시작한 안내예요"), "fake", 1, 1);
			}
			return new Result(GoalCoachTextTest.raw("나중에 시작한 안내예요"), "fake", 1, 1);
		});
		try (var pool = Executors.newSingleThreadExecutor()) {
			var earlier = pool.submit(() -> goals.coach(userId));
			try {
				assertThat(firstEntered.await(10, TimeUnit.SECONDS)).isTrue();
				assertThat(goals.coach(userId).coach().headline()).isEqualTo("나중에 시작한 안내예요");
			}
			finally {
				release.countDown();
			}
			assertThat(earlier.get(10, TimeUnit.SECONDS).coach().headline()).isEqualTo("나중에 시작한 안내예요");
		}
	}

	@Test
	void parallelRequestsForOneUserNeverExceedFreeLimit() throws Exception {
		save(1000000, "목표");
		when(ai.generate(anyString(), anyList())).thenThrow(new GoalCoachClient.Failed());
		CountDownLatch start = new CountDownLatch(1);
		try (var pool = Executors.newFixedThreadPool(8)) {
			List<Future<Boolean>> results = new java.util.ArrayList<>();
			for (int i = 0; i < 8; i++) {
				results.add(pool.submit(() -> {
					assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
					try {
						goals.coach(userId);
						return true;
					}
					catch (ApiException e) {
						assertThat(e.code()).isEqualTo(ErrorCode.TOO_MANY_ATTEMPTS);
						return false;
					}
				}));
			}
			start.countDown();
			int success = 0;
			for (var result : results) {
				if (result.get(15, TimeUnit.SECONDS)) success++;
			}
			assertThat(success).isEqualTo(3);
		}
		assertThat(userUsage()).isEqualTo(3);
		assertThat(globalUsage()).isEqualTo(3);
		verify(ai, times(3)).generate(anyString(), anyList());
	}

	@Test
	void parallelUsersNeverExceedGlobalLimitAndUnusedReservationsAreRefunded() throws Exception {
		when(ai.generate(anyString(), anyList())).thenThrow(new GoalCoachClient.Failed());
		List<Long> ids = new java.util.ArrayList<>();
		for (int i = 0; i < 8; i++) {
			long id = users.register("parallel-%s@example.com".formatted(UUID.randomUUID()), Instant.now());
			goals.put(id, new GoalInput("OTHER", "목표", 1000000L, due, 0L, 10000L));
			ids.add(id);
		}
		CountDownLatch start = new CountDownLatch(1);
		try (var pool = Executors.newFixedThreadPool(8)) {
			List<Future<String>> results = new java.util.ArrayList<>();
			for (long id : ids) {
				results.add(pool.submit(() -> {
					assertThat(start.await(10, TimeUnit.SECONDS)).isTrue();
					return goals.coach(id).coach().fallbackReason();
				}));
			}
			start.countDown();
			int capped = 0;
			for (var result : results) {
				if ("DAILY_CAP".equals(result.get(15, TimeUnit.SECONDS))) capped++;
			}
			assertThat(capped).isEqualTo(5);
		}
		int total = 0;
		for (long id : ids) {
			total += jdbc.queryForObject("SELECT count FROM goal_coach_usage WHERE user_id = ?", Integer.class, id);
		}
		assertThat(total).isEqualTo(3);
		assertThat(globalUsage()).isEqualTo(3);
		verify(ai, times(3)).generate(anyString(), anyList());
	}

	@Test
	void freeLimitResetsAtSeoulMidnightAndReturnsExactRetryDelay() {
		var limits = new GoalCoachProperties(3, 300);
		Clock before = Clock.fixed(Instant.parse("2099-01-01T14:59:59Z"), GoalCoachQuota.SEOUL);
		var quota = new GoalCoachQuota(jdbc, transactions, users, before, limits);
		for (int i = 0; i < 3; i++) assertThat(quota.reserve(userId)).isTrue();
		assertThatThrownBy(() -> quota.reserve(userId)).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.extra().get("retryAfterSeconds")).isEqualTo(1L));
		var after = new GoalCoachQuota(jdbc, transactions, users,
				Clock.fixed(Instant.parse("2099-01-01T15:00:00Z"), GoalCoachQuota.SEOUL), limits);
		assertThat(after.remaining(userId)).isEqualTo(3);
		assertThat(after.reserve(userId)).isTrue();
	}

	@Test
	void cleanupDeletesExpiredUsageBySeoulDateAndPreservesOtherDataWithoutAiKey() throws Exception {
		when(ai.enabled()).thenReturn(false);
		save(1000000, "목표").andExpect(status().isOk());
		coach().andExpect(status().isOk());
		// UTC는 아직 22일이지만 KST는 23일 03:40. 16일 기록까지 만료된다.
		Clock cleanupClock = Clock.fixed(Instant.parse("2026-10-22T18:40:00Z"), GoalCoachQuota.SEOUL);
		LocalDate today = LocalDate.of(2026, 10, 23);
		for (int age : new int[] { 8, 7, 6, 0, -1 }) {
			LocalDate day = today.minusDays(age);
			jdbc.update("INSERT INTO goal_coach_usage (usage_date, user_id, count) VALUES (?, ?, ?)", day, userId, age == 0 ? 3 : 1);
			jdbc.update("INSERT INTO ai_daily_usage (usage_date, count) VALUES (?, 1)", day);
		}
		var quota = new GoalCoachQuota(jdbc, transactions, users, cleanupClock, new GoalCoachProperties(3, 300));
		var job = new GoalCoachUsageCleanupJob(quota);
		job.run();
		job.run(); // 다시 실행해도 보관 중인 기록은 그대로다.
		assertThat(jdbc.query("SELECT usage_date FROM goal_coach_usage WHERE user_id = ? ORDER BY usage_date",
				(rs, row) -> rs.getDate(1).toLocalDate(), userId))
			.containsExactly(today.minusDays(6), today, today.plusDays(1));
		assertThat(quota.remaining(userId)).isZero();
		assertThatThrownBy(() -> quota.reserve(userId)).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo(ErrorCode.TOO_MANY_ATTEMPTS));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM ai_daily_usage", Integer.class)).isEqualTo(5);
		assertThat(globalUsage()).isEqualTo(5);
		for (String table : List.of("goals", "goal_coaches")) {
			assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM " + table + " WHERE user_id = ?", Integer.class, userId)).isEqualTo(1);
		}
	}
}
