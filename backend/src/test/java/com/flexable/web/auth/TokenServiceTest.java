package com.flexable.web.auth;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import java.nio.charset.StandardCharsets;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;

import javax.crypto.spec.SecretKeySpec;

import org.junit.jupiter.api.Test;
import org.springframework.security.oauth2.jose.jws.MacAlgorithm;
import org.springframework.security.oauth2.jwt.JwsHeader;
import org.springframework.security.oauth2.jwt.JwtClaimsSet;
import org.springframework.security.oauth2.jwt.JwtEncoderParameters;
import org.springframework.security.oauth2.jwt.JwtException;
import org.springframework.security.oauth2.jwt.NimbusJwtEncoder;

class TokenServiceTest {

	private static final String SECRET = "unit-test-secret-unit-test-secret-0123";

	private static TokenService service(String secret) {
		return new TokenService(new AuthProperties(new AuthProperties.Jwt(secret, 30)), Clock.systemUTC());
	}

	static String sign(String sub, String secret, String issuer) {
		var key = new SecretKeySpec(secret.getBytes(StandardCharsets.UTF_8), "HmacSHA256");
		var encoder = NimbusJwtEncoder.withSecretKey(key).algorithm(MacAlgorithm.HS256).build();
		Instant now = Instant.now();
		JwtClaimsSet.Builder claims = JwtClaimsSet.builder().subject(sub).issuedAt(now).expiresAt(now.plusSeconds(600))
			.claim(TokenService.TOKEN_VERSION_CLAIM, 0);
		if (issuer != null) {
			claims.issuer(issuer);
		}
		return encoder.encode(JwtEncoderParameters.from(JwsHeader.with(MacAlgorithm.HS256).build(), claims.build()))
			.getTokenValue();
	}

	@Test
	void shortOrMissingSecretFailsAtStartup() {
		assertThatThrownBy(() -> service("too-short")).isInstanceOf(IllegalStateException.class)
			.hasMessageContaining("WEB_JWT_SECRET");
		assertThatThrownBy(() -> service(null)).isInstanceOf(IllegalStateException.class);
	}

	@Test
	void issuedTokenCarriesSubjectVersionAndIssuer() {
		TokenService tokens = new TokenService(new AuthProperties(new AuthProperties.Jwt(SECRET, 30)),
				Clock.fixed(Instant.now(), ZoneOffset.UTC));
		TokenService.IssuedToken issued = tokens.issue(42, 3);
		var jwt = tokens.decoder().decode(issued.value());
		assertThat(jwt.getSubject()).isEqualTo("42");
		assertThat(((Number) jwt.getClaim(TokenService.TOKEN_VERSION_CLAIM)).intValue()).isEqualTo(3);
		assertThat(jwt.getClaimAsString("iss")).isEqualTo(TokenService.ISSUER);
		assertThat(issued.expiresAt()).isEqualTo(jwt.getExpiresAt());
	}

	/** 키가 실수로 앱과 같아져도 앱 토큰(iss 없음 또는 다른 iss)은 통과하지 못한다. */
	@Test
	void sameKeyWithoutWebIssuerIsRejected() {
		TokenService tokens = service(SECRET);
		assertThatThrownBy(() -> tokens.decoder().decode(sign("1", SECRET, null))).isInstanceOf(JwtException.class);
		assertThatThrownBy(() -> tokens.decoder().decode(sign("1", SECRET, "flexable-api")))
			.isInstanceOf(JwtException.class);
		assertThat(tokens.decoder().decode(sign("1", SECRET, TokenService.ISSUER)).getSubject()).isEqualTo("1");
	}
}
