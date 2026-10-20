package com.flexable.web.applink;

import java.time.LocalDate;
import java.time.OffsetDateTime;

/**
 * 앱 서버(project2) /internal/v1/web-links/* 호출. 운영은 http, 시연·로컬은 snapshot 구현을 쓴다.
 * 실패는 모두 AppApiException(kind)으로 돌려준다. linkId는 비밀값이라 예외·로그에 넣지 않는다.
 */
public interface AppApiClient {

	/** POST /internal/v1/web-links. 코드는 일회용이라 결과를 모르면 RESULT_UNKNOWN을 던지고 다시 보내지 않는다. */
	CreatedLink create(String code);

	/** GET /internal/v1/web-links/{linkId}/profile */
	AppProfile profile(String linkId);

	/** GET /internal/v1/web-links/{linkId}/seed-money. 앱 예산 설정 전이면 BUDGET_NOT_SET */
	AppSeedMoney seedMoney(String linkId);

	/** DELETE /internal/v1/web-links/{linkId} */
	void delete(String linkId);

	record CreatedLink(String linkId, AppProfile profile) {

		@Override
		public String toString() {
			return "CreatedLink[linkId=***, profile=" + profile + "]";
		}
	}

	/** provider는 email·kakao·google. 소셜 계정은 email이 null일 수 있다. */
	record AppProfile(String email, String provider) {
	}

	/** 앱이 확정한 값만 온다. 금액은 원 단위 정수이고 웹에서 다시 계산하지 않는다. */
	record AppSeedMoney(long total, long base, long monthlyGoal, LastEntry lastEntry, OffsetDateTime updatedAt) {
	}

	record LastEntry(LocalDate cycleEnd, String choice, long amount, OffsetDateTime createdAt) {
	}
}
