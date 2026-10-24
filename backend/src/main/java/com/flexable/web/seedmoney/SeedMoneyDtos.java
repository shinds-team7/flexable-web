package com.flexable.web.seedmoney;

import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;

import com.flexable.web.applink.AppLinkDtos.AppLinkResponse;
import com.flexable.web.applink.AppLinkDtos.Entry;
import com.flexable.web.applink.AppLinkDtos.Sync;
import com.flexable.web.common.Times;
import com.flexable.web.common.WholeWonDeserializer;

import tools.jackson.databind.annotation.JsonDeserialize;

public final class SeedMoneyDtos {

	/** 직접 고칠 수 있는 시드머니 범위(원) */
	public static final long MAX_MANUAL_TOTAL = 1_000_000_000;

	private SeedMoneyDtos() {
	}

	/** PUT /api/v1/me/seed-money/manual. total: 0원 ~ 10억 원 */
	public record ManualRequest(@JsonDeserialize(using = WholeWonDeserializer.class) Long total) {
	}

	/** 웹에서 직접 고친 값. 있으면 화면·시뮬레이션은 앱 연동 값 대신 이 값을 쓴다(decisions 2026-10-24 ②). */
	public record Manual(long total, OffsetDateTime updatedAt) {

		static Manual of(SeedMoneyManual m) {
			return m == null ? null : new Manual(m.total, Times.at(m.updatedAt));
		}
	}

	/**
	 * GET /api/v1/me/seed-money. source: app(앱 연동 값) 또는 none(연동 없음, 앱 값 필드는 null).
	 * status·금액·entries는 앱 연동 응답의 seedMoney와 같다(available일 때만 금액이 있음). 그래프는 (startedOn, base) 다음에 (cycleEnd, totalAfter)를 잇는다.
	 * manual: 웹에서 직접 고친 값(없으면 null). 연동 여부와 관계없이 있으면 우선한다. 앱 값(total 등)은 바꾸지 않고 그대로 둔다.
	 */
	public record SeedMoneyResponse(String source, String status, Long total, Long base, Long monthlyGoal,
			LocalDate startedOn, OffsetDateTime updatedAt, List<Entry> entries, Sync sync, Manual manual) {

		static SeedMoneyResponse of(AppLinkResponse link, Manual manual) {
			if (!link.linked()) {
				return new SeedMoneyResponse("none", null, null, null, null, null, null, null, null, manual);
			}
			var s = link.seedMoney();
			return new SeedMoneyResponse("app", s.status(), s.total(), s.base(), s.monthlyGoal(), s.startedOn(),
					s.updatedAt(), s.entries(), link.sync(), manual);
		}
	}
}
