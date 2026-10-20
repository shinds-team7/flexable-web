package com.flexable.web.applink;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.time.Duration;
import java.util.Base64;

import org.junit.jupiter.api.Test;

class LinkIdCipherTest {

	private static final String LINK_ID = "AbCdEfGhIjKlMnOpQrStUvWxYz0123456789_-abcde";
	private static final String KEY = Base64.getEncoder().encodeToString(new byte[32]);

	private static AppLinkProperties props(String mode, String baseUrl, String key) {
		return new AppLinkProperties(mode, baseUrl, baseUrl == null ? null : "service-key", key, Duration.ofSeconds(1),
				Duration.ofSeconds(1), Duration.ZERO);
	}

	@Test
	void roundTripsWithoutStoringPlainText() {
		LinkIdCipher cipher = new LinkIdCipher(props("http", "https://app.example.com", KEY));
		String a = cipher.encrypt(LINK_ID);
		String b = cipher.encrypt(LINK_ID);
		assertThat(a).startsWith("v1:").doesNotContain(LINK_ID).isNotEqualTo(b);
		assertThat(a.length()).isLessThanOrEqualTo(255);
		assertThat(cipher.decrypt(a)).isEqualTo(LINK_ID);
		// 같은 키면 다시 시작해도 읽을 수 있다.
		assertThat(new LinkIdCipher(props("http", "https://app.example.com", KEY)).decrypt(a)).isEqualTo(LINK_ID);
	}

	@Test
	void otherKeyOrTamperedValueIsRejectedWithoutLeakingIt() {
		String sealed = new LinkIdCipher(props("http", null, null)).encrypt(LINK_ID);
		LinkIdCipher other = new LinkIdCipher(props("http", null, null));
		assertThatThrownBy(() -> other.decrypt(sealed)).isInstanceOf(IllegalStateException.class)
			.hasMessageNotContaining(LINK_ID);
		assertThatThrownBy(() -> other.decrypt("plain")).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void keyIsRequiredOnceTheAppServerIsConfigured() {
		assertThatThrownBy(() -> new LinkIdCipher(props("http", "https://app.example.com", "")))
			.isInstanceOf(IllegalStateException.class).hasMessageContaining("APP_LINK_ENCRYPTION_KEY");
		assertThatThrownBy(() -> new LinkIdCipher(props("http", "https://app.example.com", "c2hvcnQ=")))
			.hasMessageContaining("32바이트");
		// snapshot·미설정은 임의 키로 시작한다.
		new LinkIdCipher(props("snapshot", "https://app.example.com", ""));
		new LinkIdCipher(props("http", null, null));
	}
}
