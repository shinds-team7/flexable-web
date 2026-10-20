package com.flexable.web.applink.snapshot;

import java.security.SecureRandom;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.Base64;
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
 * 앱 코드 규칙(8자리, 0·1·I·L·O 제외)에 맞으면 연동되고, 연동은 서버를 다시 띄우면 사라진다(다음 조회에서 해제로 보인다).
 */
@Component
@ConditionalOnProperty(prefix = "app.applink", name = "mode", havingValue = "snapshot")
public class SnapshotAppApiClient implements AppApiClient {

	private static final String CODE_PATTERN = "[A-HJKMNP-Z2-9]{8}";
	private static final AppProfile PROFILE = new AppProfile("demo@example.com", "email");
	private static final AppSeedMoney SEED = new AppSeedMoney(1_450_000, 500_000, 300_000,
			new LastEntry(LocalDate.parse("2026-09-25"), "ALL", 950_000, OffsetDateTime.parse("2026-09-25T20:10:00+09:00")),
			OffsetDateTime.parse("2026-09-25T20:10:00+09:00"));

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
