package com.flexable.web.applink.snapshot;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
import java.util.List;
import java.util.Locale;
import java.util.Set;
import java.util.concurrent.ConcurrentHashMap;

import org.springframework.boot.autoconfigure.condition.ConditionalOnProperty;
import org.springframework.stereotype.Component;

import com.flexable.web.applink.AppApiClient;
import com.flexable.web.applink.AppApiException;
import com.flexable.web.applink.AppApiException.Kind;

/**
 * 앱 서버 없이 쓰는 고정 연동(APP_LINK_MODE=snapshot). 로컬 화면 확인·인터넷 없는 시연용이며 실제 사용자 데이터는 없다.
 * 앱 코드 규칙(6자리, 0·1·I·L·O 제외)에 맞으면 연동되고, 연동은 서버를 다시 띄우면 사라진다(다음 조회에서 해제로 보인다).
 */
@Component
@ConditionalOnProperty(prefix = "app.applink", name = "mode", havingValue = "snapshot")
public class SnapshotAppApiClient implements AppApiClient {

	private static final String CODE_PATTERN = "[A-HJKMNP-Z2-9]{6}";
	private static final AppProfile PROFILE = new AppProfile("demo@example.com", "email");
	private static final AppSeedMoney SEED = new AppSeedMoney(1_450_000, 500_000, 300_000,
			new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 650_000, OffsetDateTime.parse("2026-09-25T20:10:00+09:00")),
			OffsetDateTime.parse("2026-09-25T20:10:00+09:00"), LocalDate.parse("2026-06-26"), List.of(
					new Entry(LocalDate.parse("2026-07-25"), "GOAL", 300_000, 800_000,
							OffsetDateTime.parse("2026-07-24T20:05:00+09:00")),
					new Entry(LocalDate.parse("2026-08-25"), "MANUAL", 0, 800_000,
							OffsetDateTime.parse("2026-08-24T21:00:00+09:00")),
					new Entry(LocalDate.parse("2026-09-25"), "ALL", 650_000, 1_450_000,
							OffsetDateTime.parse("2026-09-25T20:10:00+09:00"))));

	private final SecureRandom random = new SecureRandom();
	private final Set<String> links = ConcurrentHashMap.newKeySet();

	@Override
	public CreatedLink create(String code) {
		String normalized = code.replaceAll("[\\s-]", "").toUpperCase(Locale.ROOT);
		if (!normalized.matches(CODE_PATTERN)) {
			throw new AppApiException(Kind.CODE_INVALID);
		}
		byte[] bytes = new byte[32];
		random.nextBytes(bytes);
		String linkId = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		links.add(linkId);
		return new CreatedLink(linkId, PROFILE);
	}

	@Override
	public AppProfile profile(String linkId) {
		require(linkId);
		return PROFILE;
	}

	@Override
	public AppSeedMoney seedMoney(String linkId) {
		require(linkId);
		return SEED;
	}

	/** 고정 값이라 저장하지 않는다. 받은 총액이 되도록 모아둔 돈만 바꾼 값을 돌려준다(반영한 돈 950,000보다 작으면 거절). */
	@Override
	public AppSeedMoney updateSeedMoney(String linkId, long total) {
		require(linkId);
		long saved = SEED.total() - SEED.base();
		if (total < saved) {
			throw new AppApiException(Kind.REJECTED, "앱에서 반영한 돈(" + String.format("%,d", saved) + "원)보다 작게 고칠 수 없어요");
		}
		return new AppSeedMoney(total, total - saved, SEED.monthlyGoal(), SEED.lastEntry(), OffsetDateTime.now(),
				SEED.startedOn(), SEED.entries().stream()
					.map(e -> new Entry(e.cycleEnd(), e.choice(), e.amount(), e.totalAfter() + total - SEED.total(), e.createdAt()))
					.toList());
	}

	@Override
	public void delete(String linkId) {
		if (!links.remove(linkId)) {
			throw new AppApiException(Kind.LINK_NOT_FOUND);
		}
	}

	private void require(String linkId) {
		if (!links.contains(linkId)) {
			throw new AppApiException(Kind.LINK_NOT_FOUND);
		}
	}
}
