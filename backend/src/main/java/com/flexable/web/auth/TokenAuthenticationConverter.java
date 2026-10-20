package com.flexable.web.auth;

import java.util.List;

import org.springframework.core.convert.converter.Converter;
import org.springframework.security.authentication.AbstractAuthenticationToken;
import org.springframework.security.oauth2.jwt.Jwt;
import org.springframework.security.oauth2.server.resource.InvalidBearerTokenException;
import org.springframework.security.oauth2.server.resource.authentication.JwtAuthenticationToken;
import org.springframework.stereotype.Component;

/** 서명이 맞아도 탈퇴한 회원이거나 로그아웃(토큰 버전 증가)된 토큰이면 거절한다. */
@Component
public class TokenAuthenticationConverter implements Converter<Jwt, AbstractAuthenticationToken> {

	private final CredentialRepository credentials;

	public TokenAuthenticationConverter(CredentialRepository credentials) {
		this.credentials = credentials;
	}

	@Override
	public AbstractAuthenticationToken convert(Jwt jwt) {
		long memberId;
		try {
			memberId = Long.parseLong(jwt.getSubject());
		}
		catch (NumberFormatException e) {
			throw new InvalidBearerTokenException("invalid subject");
		}
		Object tv = jwt.getClaims().get(TokenService.TOKEN_VERSION_CLAIM);
		boolean valid = tv instanceof Number n && credentials.findById(memberId)
			.map(c -> c.getTokenVersion() == n.intValue())
			.orElse(false);
		if (!valid) {
			throw new InvalidBearerTokenException("revoked");
		}
		return new JwtAuthenticationToken(jwt, List.of(), jwt.getSubject());
	}
}
