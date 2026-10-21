package com.flexable.web.applink;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.flexable.web.common.Times;

import jakarta.validation.constraints.NotBlank;
import jakarta.validation.constraints.Pattern;
import jakarta.validation.constraints.Size;

public final class AppLinkDtos {

	/** 미연동 응답의 reason: 앱에서 해제했거나 앱을 탈퇴해 웹 연동을 정리했다(이번 조회에서 알게 됨). */
	public static final String REASON_APP_UNLINKED = "app_unlinked";

	private AppLinkDtos() {
	}

	/** 앱 화면의 코드(K7M2-Q9XB). 대소문자·공백·하이픈 정규화는 앱 서버가 한다. */
	public record LinkRequest(
			@NotBlank(message = "앱에서 받은 코드를 입력해 주세요")
			@Size(max = 20, message = "코드는 8자리예요")
			@Pattern(regexp = "[A-Za-z0-9 -]*", message = "코드는 영문과 숫자로 되어 있어요") String code) {
	}

	/** 시드머니를 아직 한 번도 받지 못함(연동 직후 조회 실패) */
	static final String SEED_NOT_RECEIVED = "not_received";
	static final String SYNC_FRESH = "fresh";
	static final String SYNC_STALE = "stale";

	/**
	 * GET·POST /api/v1/app-link 응답. 연동이 없으면 linked=false이고 enabled·reason 말고는 null이다.
	 *
	 * @param enabled 웹 서버에 앱 서버 주소·서비스 키가 설정됐는지. false면 화면이 [앱 연동하기]를 숨긴다
	 * @param reason 미연동일 때만. app_unlinked = 앱에서 해제·앱 탈퇴로 이번 조회에서 연동이 끝남
	 * @param account 앱 회원 정보(email은 소셜 계정이면 null일 수 있음)
	 * @param seedMoney 앱에서 확정한 시드머니(마지막으로 받은 값)
	 * @param sync fresh = 방금(또는 refreshInterval 안에) 앱 서버에서 받음, stale = 마지막 조회 실패라 syncedAt 기준 값
	 */
	public record AppLinkResponse(boolean enabled, boolean linked, String reason, OffsetDateTime linkedAt,
			Account account, SeedMoney seedMoney, Sync sync) {

		static AppLinkResponse none(boolean enabled, String reason) {
			return new AppLinkResponse(enabled, false, reason, null, null, null, null);
		}

		static AppLinkResponse of(boolean enabled, AppLink l) {
			String seedStatus = l.getSeedState() == null ? SEED_NOT_RECEIVED : l.getSeedState();
			LastEntry last = l.getSeedLastCycleEnd() == null ? null
					: new LastEntry(l.getSeedLastCycleEnd(), l.getSeedLastChoice(), l.getSeedLastAmount(),
							Times.at(l.getSeedLastCreatedAt()));
			SeedMoney seed = AppLink.SEED_AVAILABLE.equals(seedStatus)
					? new SeedMoney(seedStatus, l.getSeedTotal(), l.getSeedBase(), l.getSeedMonthlyGoal(), last,
							Times.at(l.getSeedUpdatedAt()), l.getSeedStartedOn(),
							l.getSeedEntries().stream()
								.map(e -> new Entry(e.getCycleEnd(), e.getChoice(), e.getAmount(), e.getTotalAfter(),
										Times.at(e.getCreatedAt())))
								.toList())
					: new SeedMoney(seedStatus, null, null, null, null, null, null, null);
			return new AppLinkResponse(enabled, true, null, Times.at(l.getCreatedAt()),
					new Account(l.getAppEmail(), l.getAppProvider()), seed,
					new Sync(l.stale() ? SYNC_STALE : SYNC_FRESH, Times.at(l.getSyncedAt())));
		}
	}

	public record Account(String email, String provider) {
	}

	/**
	 * status: available(금액 있음), budget_not_set(앱 예산 설정 전), not_received(아직 한 번도 받지 못함). 금액은 available일 때만 있다.
	 * startedOn은 앱 첫 하루 예산 기록일(없으면 null), entries는 주기별 반영 기록(주기 종료일 오름차순, 앱 계산 값 그대로).
	 */
	public record SeedMoney(String status, Long total, Long base, Long monthlyGoal, LastEntry lastEntry,
			OffsetDateTime updatedAt, LocalDate startedOn, List<Entry> entries) {
	}

	/** totalAfter: 반영 후 합계(앱이 조회 시점의 모아둔 돈 기준으로 계산) */
	public record Entry(LocalDate cycleEnd, String choice, long amount, long totalAfter, OffsetDateTime createdAt) {
	}

	/** choice: GOAL·ALL·MANUAL(앱 API 문서 "시드머니") */
	public record LastEntry(LocalDate cycleEnd, String choice, Long amount, OffsetDateTime createdAt) {
	}

	public record Sync(String status, OffsetDateTime syncedAt) {
	}
}
