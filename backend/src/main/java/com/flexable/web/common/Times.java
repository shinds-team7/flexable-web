package com.flexable.web.common;

import java.time.Instant;
import java.time.OffsetDateTime;
import java.time.ZoneId;

/** DB에는 UTC로 저장하고 응답은 한국 시각(+09:00)으로 내보낸다. */
public final class Times {

	public static final ZoneId ZONE = ZoneId.of("Asia/Seoul");

	private Times() {
	}

	public static OffsetDateTime at(Instant instant) {
		return instant == null ? null : instant.atZone(ZONE).toOffsetDateTime();
	}
}
