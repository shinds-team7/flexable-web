package com.flexable.web.auth;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.temporal.ChronoUnit;

import javax.crypto.SecretKey;
import javax.crypto.spec.SecretKeySpec;

import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtDecoder;
import org.springframework.security.oauth2.jwt.JwtEncoder;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtValidators;
import org.springframework.security.oauth2.jwt.NimbusJwtDecoder;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;
import org.springframework.stereotype.Component;

/**
 * 웹 토큰(HS256). 웹 백엔드 자체 비밀키로만 서명·검증하므로 앱(project2) 토큰은 여기서 통과하지 못한다(04 §4).
 * iss를 넣고 검사해 키가 실수로 같아도 앱 토큰과 섞이지 않게 한다.
 */
@Component
public class TokenService {

	public static final String TOKEN_VERSION_CLAIM = "tv";
	static final String ISSUER = "flexable-web";

	private final JwtEncoder encoder;
	private final JwtDecoder decoder;
	private final Duration ttl;
	private final Clock clock;

	public TokenService(AuthProperties props, Clock clock) {
		String secret = props.jwt().secret();
		if (secret == null || secret.getBytes(StandardCharsets.UTF_8).length < 32) {
			throw new IllegalStateException("WEB_JWT_SECRET must be at least 32 bytes");
		}
		SecretKey key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		this.encoder = NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
		NimbusJwtDecoder nimbus = NimbusJwtDecoder.withSecretKey(key).macAlgorithm(MacAlgorithm.HS256).build();
		nimbus.setJwtValidator(JwtValidators.createDefaultWithIssuer(ISSUER));
		this.decoder = nimbus;
		this.ttl = Duration.ofDays(props.jwt().ttlDays());
		this.clock = clock;
	}

	IssuedToken issue(long memberId, int tokenVersion) {
		// JWT의 iat·exp는 초 단위라 응답의 expiresAt도 초에서 자른다.
		Instant now = clock.instant().truncatedTo(ChronoUnit.SECONDS);
		Instant expiresAt = now.plus(ttl);
		JwtClaimsSet claims = JwtClaimsSet.builder()
			.issuer(ISSUER)
			.subject(String.valueOf(memberId))
			.issuedAt(now)
			.expiresAt(expiresAt)
			.claim(TOKEN_VERSION_CLAIM, tokenVersion)
			.build();
		JwsHeader header = JwsHeader.with(MacAlgorithm.HS256).build();
		String value = encoder.encode(JwtEncoderParameters.from(header, claims)).getTokenValue();
		return new IssuedToken(value, expiresAt);
	}

	public JwtDecoder decoder() {
		return decoder;
	}

	record IssuedToken(String value, Instant expiresAt) {
	}
}
