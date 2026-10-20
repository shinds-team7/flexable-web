package com.flexable.web.applink;

import java.nio.charset.StandardCharsets;
import java.security.GeneralSecurityException;
import java.security.SecureRandom;
import java.util.Arrays;
import java.util.Base64;

import javax.crypto.Cipher;
import javax.crypto.spec.GCMParameterSpec;
import javax.crypto.spec.SecretKeySpec;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;
import org.springframework.stereotype.Component;

/**
 * linkId는 앱 회원 정보를 읽는 비밀값이라 DB에 평문으로 두지 않는다(AES-256-GCM, 저장 형식 "v1:" + Base64(iv‖암호문)).
 * 키(APP_LINK_ENCRYPTION_KEY)를 바꾸면 저장된 연동을 읽을 수 없으므로 운영에서는 고정 값을 쓴다.
 * 앱 서버 주소가 설정된 http 모드에서 키가 없으면 시작하지 않는다. 그 밖(테스트·로컬·snapshot)은 실행마다 임의 키를 만든다.
 */
@Component
public class LinkIdCipher {

	private static final Logger log = LoggerFactory.getLogger(LinkIdCipher.class);
	private static final String PREFIX = "v1:";
	private static final int IV_BYTES = 12;
	private static final int TAG_BITS = 128;

	private final SecretKeySpec key;
	private final SecureRandom random = new SecureRandom();

	public LinkIdCipher(AppLinkProperties props) {
		String configured = props.encryptionKey();
		byte[] raw;
		if (configured == null || configured.isBlank()) {
			if (!props.snapshot() && props.configured()) {
				throw new IllegalStateException("APP_LINK_ENCRYPTION_KEY가 필요합니다(Base64, 32바이트)");
			}
			raw = new byte[32];
			random.nextBytes(raw);
			log.info("APP_LINK_ENCRYPTION_KEY가 없어 이번 실행에서만 쓰는 임의 키로 연동을 저장합니다");
		}
		else {
			try {
				raw = Base64.getDecoder().decode(configured.trim());
			}
			catch (IllegalArgumentException e) {
				throw new IllegalStateException("APP_LINK_ENCRYPTION_KEY는 Base64여야 합니다");
			}
			if (raw.length != 32) {
				throw new IllegalStateException("APP_LINK_ENCRYPTION_KEY는 32바이트여야 합니다");
			}
		}
		this.key = new SecretKeySpec(raw, "AES");
	}

	public String encrypt(String linkId) {
		try {
			byte[] iv = new byte[IV_BYTES];
			random.nextBytes(iv);
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.ENCRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, iv));
			byte[] sealed = cipher.doFinal(linkId.getBytes(StandardCharsets.UTF_8));
			byte[] out = Arrays.copyOf(iv, IV_BYTES + sealed.length);
			System.arraycopy(sealed, 0, out, IV_BYTES, sealed.length);
			return PREFIX + Base64.getEncoder().encodeToString(out);
		}
		catch (GeneralSecurityException e) {
			throw new IllegalStateException("연동 정보를 암호화하지 못했습니다");
		}
	}

	/** 키가 바뀌었거나 값이 손상되면 IllegalStateException(값은 메시지에 넣지 않는다). */
	public String decrypt(String stored) {
		try {
			if (stored == null || !stored.startsWith(PREFIX)) {
				throw new IllegalStateException("연동 정보 형식 오류");
			}
			byte[] in = Base64.getDecoder().decode(stored.substring(PREFIX.length()));
			Cipher cipher = Cipher.getInstance("AES/GCM/NoPadding");
			cipher.init(Cipher.DECRYPT_MODE, key, new GCMParameterSpec(TAG_BITS, in, 0, IV_BYTES));
			return new String(cipher.doFinal(in, IV_BYTES, in.length - IV_BYTES), StandardCharsets.UTF_8);
		}
		catch (GeneralSecurityException | IllegalArgumentException e) {
			throw new IllegalStateException("연동 정보를 읽지 못했습니다");
		}
	}
}
