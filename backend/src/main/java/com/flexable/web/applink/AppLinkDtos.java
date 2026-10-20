package com.flexable.web.applink;

import java.time.LocalDate;
import java.time.OffsetDateTime;

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

	/**
	 * GET·POST /api/v1/app-link 응답. 연동이 없으면 linked=false이고 나머지는 null이다.
	 *
	 * @param reason 미연동일 때만. app_unlinked = 앱에서 해제·앱 탈퇴로 이번 조회에서 연동이 끝남
	 * @param account 앱 회원 정보(email은 소셜 계정이면 null일 수 있음)
	 * @param seedMoney 앱에서 확정한 시드머니(마지막으로 받은 값)
	 * @param sync ok = 방금(또는 refreshInterval 안에) 앱 서버에서 받음, stale = 마지막 조회 실패라 syncedAt 기준 값
	 */
	public record AppLinkResponse(boolean linked, String reason, OffsetDateTime linkedAt, Account account,
			SeedMoney seedMoney, Sync sync) {

		static AppLinkResponse none(String reason) {
			return new AppLinkResponse(false, reason, null, null, null, null);
		}

		static AppLinkResponse of(AppLink l) {
			String seedState = l.getSeedState() == null ? "unknown" : l.getSeedState();
			LastEntry last = l.getSeedLastCycleEnd() == null ? null
					: new LastEntry(l.getSeedLastCycleEnd(), l.getSeedLastChoice(), l.getSeedLastAmount(),
							Times.at(l.getSeedLastCreatedAt()));
			SeedMoney seed = AppLink.SEED_OK.equals(seedState)
					? new SeedMoney(seedState, l.getSeedTotal(), l.getSeedBase(), l.getSeedMonthlyGoal(), last,
							Times.at(l.getSeedUpdatedAt()))
					: new SeedMoney(seedState, null, null, null, null, null);
			return new AppLinkResponse(true, null, Times.at(l.getCreatedAt()),
					new Account(l.getAppEmail(), l.getAppProvider()), seed,
					new Sync(l.stale() ? "stale" : "ok", Times.at(l.getSyncedAt())));
		}
	}

	public record Account(String email, String provider) {
	}

	/** state: ok(금액 있음), budget_not_set(앱 예산 설정 전), unknown(아직 한 번도 받지 못함). 금액은 ok일 때만 있다. */
	public record SeedMoney(String state, Long total, Long base, Long monthlyGoal, LastEntry lastEntry,
			OffsetDateTime updatedAt) {
	}

	/** choice: GOAL·ALL·MANUAL(앱 API 문서 "시드머니") */
	public record LastEntry(LocalDate cycleEnd, String choice, Long amount, OffsetDateTime createdAt) {
	}

	public record Sync(String state, OffsetDateTime syncedAt) {
	}
}
