package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.mockito.ArgumentMatchers.anyBoolean;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.when;

import java.math.BigDecimal;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.EnumMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.UUID;

import org.junit.jupiter.api.Test;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Command;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.virtualsim.VirtualSimDtos.Decision;
import com.flexable.web.virtualsim.VirtualSimDtos.Snapshot;
import com.flexable.web.virtualsim.VirtualSimDtos.Start;
import com.flexable.web.virtualsim.VirtualSimStore.Company;

/** 가상 시뮬레이션 세션 규칙(decisions/2026-11-04-virtual-simulation 2·7·8·9). 저장소는 바꿔 끼우고 외부 호출은 없다 */
class VirtualSimServiceTest {

	/** 시계를 옮길 수 있게 둔다(30분 만료 확인) */
	private static final class MovableClock extends Clock {
		Instant now = Instant.parse("2026-11-04T01:00:00Z");

		@Override
		public ZoneId getZone() {
			return ZoneOffset.UTC;
		}

		@Override
		public Clock withZone(ZoneId zone) {
			return Clock.fixed(now, zone);
		}

		@Override
		public Instant instant() {
			return now;
		}
	}

	private static Company company(boolean sample, VirtualSimCategory... categories) {
		Map<VirtualSimCategory, String> bodies = new EnumMap<>(VirtualSimCategory.class);
		for (VirtualSimCategory c : categories) {
			bodies.put(c, "누리모빌리티가 " + c.displayName() + " 관련 사항을 결정했어요.");
		}
		return new Company(1, "누리모빌리티", "로봇", "물류 창고용 이동 로봇을 만드는 회사예요.", sample ? "sample" : "gemini-test", Instant.parse("2026-11-03T00:00:00Z"),
				sample, bodies);
	}

	private static Start start() {
		return new Start(UUID.randomUUID(), new BigDecimal("1000000"));
	}

	@Test
	void 후보가_없으면_시작은_503이고_상태는_준비_중() {
		VirtualSimStore store = mock(VirtualSimStore.class);
		when(store.latestRuleset(false)).thenReturn(Optional.empty());
		var service = new VirtualSimService(store, new MovableClock(), "gemini", 10);
		assertThat(service.status().available()).isFalse();
		assertThatThrownBy(() -> service.start(start())).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo(ErrorCode.PRACTICE_UNAVAILABLE));

		// 룰셋은 있지만 공개 가능한 사건이 3개 미만이거나 뚜렷한 유형이 2개 미만인 회사뿐
		VirtualSimStore sample = mock(VirtualSimStore.class);
		when(sample.companies(true, VirtualSimChecker.VERSION)).thenReturn(List.of(
				company(true, VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.BUYBACK_ACQUIRE),
				company(true, VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.EARNINGS, VirtualSimCategory.DIVIDEND, VirtualSimCategory.OWNERSHIP)));
		var fake = new VirtualSimService(sample, new MovableClock(), "fake", 10);
		assertThat(fake.status()).isEqualTo(new VirtualSimDtos.Status(false, true));
		assertThatThrownBy(() -> fake.start(start())).isInstanceOf(ApiException.class);
	}

	@Test
	void 실제_모드는_예시_회사를_쓰지_않는다() {
		VirtualSimStore store = mock(VirtualSimStore.class);
		when(store.latestRuleset(false)).thenReturn(Optional.of(VirtualSimSample.ruleset()));
		when(store.companies(anyBoolean(), anyString())).thenAnswer(inv -> (Boolean) inv.getArgument(0) ? List.of(company(true,
				VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.BUYBACK_ACQUIRE, VirtualSimCategory.NEW_SHARES)) : List.of());
		var service = new VirtualSimService(store, new MovableClock(), "gemini", 10);
		assertThat(service.status().available()).isFalse();
	}

	@Test
	void 세션_규칙() {
		VirtualSimStore store = mock(VirtualSimStore.class);
		when(store.companies(true, VirtualSimChecker.VERSION)).thenReturn(List.of(company(true, VirtualSimCategory.SUPPLY_CONTRACT,
				VirtualSimCategory.BUYBACK_ACQUIRE, VirtualSimCategory.NEW_SHARES, VirtualSimCategory.EARNINGS, VirtualSimCategory.DIVIDEND)));
		MovableClock clock = new MovableClock();
		var service = new VirtualSimService(store, clock, "fake", 2);
		Start input = start();
		var started = service.start(input);
		assertThat(service.start(input).sessionToken()).isEqualTo(started.sessionToken());
		assertThatThrownBy(() -> service.start(new Start(input.startId(), new BigDecimal("20000")))).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo(ErrorCode.PRACTICE_CONFLICT));
		Snapshot first = started.snapshot();
		assertThat(first.candles()).hasSize(1);
		assertThat(first.isSample()).isTrue();
		assertThat(first.generator().aiGenerated()).isFalse();
		assertThat(first.notice()).isEqualTo(VirtualSimService.SAMPLE_NOTICE);
		String token = started.sessionToken();

		// 첫 진행은 첫 사건까지. 사건에서 멈추면 선택 전 진행은 409, 오래된 version도 409
		Snapshot s = service.step(new Command(token, UUID.randomUUID(), 0));
		assertThat(s.status()).isEqualTo("AWAITING_DECISION");
		assertThat(s.frames()).hasSize(s.candles().size() - 1);
		assertThat(s.candles().size() - 1).isGreaterThanOrEqualTo(14);
		assertThatThrownBy(() -> service.step(new Command(token, UUID.randomUUID(), 1))).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.step(new Command(token, UUID.randomUUID(), 0))).isInstanceOf(ApiException.class);
		assertThatThrownBy(() -> service.decide(new Decision(token, UUID.randomUUID(), 1, "nope", Action.HOLD, 0L)))
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.PRACTICE_CONFLICT));
		// 수량 상한은 서버가 준 값: 보유보다 많이 팔거나 유지에 수량을 넣으면 400
		var limits = s.event().orderLimits();
		assertThat(limits.referencePrice()).isEqualTo(s.candles().getLast().close());
		assertThat(limits.maxSellShares()).isEqualTo(s.portfolio().shares());
		assertThat(limits.maxBuyShares()).isEqualTo(s.portfolio().cash() / limits.referencePrice());
		assertThatThrownBy(() -> service.decide(new Decision(token, UUID.randomUUID(), 1, s.event().id(), Action.SELL, limits.maxSellShares() + 1)))
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_FAILED));
		assertThatThrownBy(() -> service.decide(new Decision(token, UUID.randomUUID(), 1, s.event().id(), Action.HOLD, 1L)))
			.isInstanceOfSatisfying(ApiException.class, e -> assertThat(e.code()).isEqualTo(ErrorCode.VALIDATION_FAILED));
		Snapshot decided = service.decide(new Decision(token, UUID.randomUUID(), 1, s.event().id(), Action.SELL, limits.maxSellShares()));
		assertThat(decided.decisions().getFirst().prediction()).isEqualTo(Prediction.NEGATIVE);
		assertThat(decided.decisions().getFirst().quantity()).isEqualTo(limits.maxSellShares());
		assertThat(decided.decisions().getFirst().trend()).isNull();
		assertThat(decided.decisions().getFirst().movement()).isNull();
		assertThat(decided.decisions().getFirst().categoryUpShare()).isNull();
		assertThat(decided.decisions().getFirst().title()).isIn(s.event().category().titles());

		// 다음 진행에서 체결하고 다섯 번째 후속 거래일에 판정·경향 채점을 함께 정한다
		Snapshot next = service.step(new Command(token, UUID.randomUUID(), 2));
		var judged = next.decisions().getFirst();
		assertThat(judged.execution()).isIn("FILLED", "NO_FILL");
		assertThat(judged.executedShares()).isEqualTo(limits.maxSellShares());
		assertThat(judged.movement()).isIn("UP", "DOWN", "FLAT");
		assertThat(judged.outcome()).isNotNull();
		assertThat(judged.trend()).isIn("UP", "DOWN", "MIXED");
		assertThat(judged.trendOutcome()).isEqualTo(VirtualSimService.trendOutcome(judged.trend(), Prediction.NEGATIVE));
		assertThat(judged.categorySampleCount()).isEqualTo(300);

		// 세션 상한(이 테스트는 2)
		service.start(start());
		assertThatThrownBy(() -> service.start(start())).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo(ErrorCode.PRACTICE_CAPACITY));

		// 30분이 지나면 410
		clock.now = clock.now.plusSeconds(1800);
		assertThatThrownBy(() -> service.state(token)).isInstanceOfSatisfying(ApiException.class,
				e -> assertThat(e.code()).isEqualTo(ErrorCode.PRACTICE_EXPIRED));
		service.end(token);
	}
}
