package com.flexable.web.seedmoney;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.flexable.web.applink.AppLinkDtos.AppLinkResponse;
import com.flexable.web.applink.AppLinkDtos.Entry;
import com.flexable.web.applink.AppLinkDtos.Sync;

public final class SeedMoneyDtos {

	private SeedMoneyDtos() {
	}

	/**
	 * GET /api/v1/me/seed-money. source: app(앱 연동 값) 또는 none(연동 없음, 나머지 null).
	 * status·금액·entries는 앱 연동 응답의 seedMoney와 같다(available일 때만 금액이 있음). 그래프는 (startedOn, base) 다음에 (cycleEnd, totalAfter)를 잇는다.
	 */
	public record SeedMoneyResponse(String source, String status, Long total, Long base, Long monthlyGoal,
			LocalDate startedOn, OffsetDateTime updatedAt, List<Entry> entries, Sync sync) {

		static SeedMoneyResponse of(AppLinkResponse link) {
			if (!link.linked()) {
				return new SeedMoneyResponse("none", null, null, null, null, null, null, null, null);
			}
			var s = link.seedMoney();
			return new SeedMoneyResponse("app", s.status(), s.total(), s.base(), s.monthlyGoal(), s.startedOn(),
					s.updatedAt(), s.entries(), link.sync());
		}
	}
}
