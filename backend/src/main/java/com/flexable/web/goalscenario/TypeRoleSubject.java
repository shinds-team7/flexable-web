package com.flexable.web.goalscenario;

import java.nio.charset.StandardCharsets;
import java.security.MessageDigest;
import java.security.NoSuchAlgorithmException;
import java.util.HexFormat;
import java.util.List;

import tools.jackson.databind.json.JsonMapper;

/**
 * 미리 만드는 유형 해설 하나의 대상(#417). input은 AI에게 보내는 유형 자료 전부이고, fingerprint는 그 JSON의 SHA-256이다.
 * 자료(상품·금리·통계·함께 볼 상품·만기 경우)가 같으면 지문이 같아 저장된 해설을 그대로 쓴다.
 */
record TypeRoleSubject(ProductType type, Input input, String fingerprint) {
	private static final JsonMapper JSON = JsonMapper.builder().build();

	/**
	 * AI에게 보내는 유형 자료. 목표 금액·기한·회원 정보는 없다. 적금의 afterMaturity는 만기가 기한보다 짧은 경우(만기 뒤 CMA로 이어 감)이고,
	 * 남은 달 수는 사용자마다 달라 넣지 않는다. 다른 유형은 null.
	 */
	record Input(String type, String description, String ratePercent, String meanMonthlyReturn, String monthlyVolatility, String maxDrawdown,
			List<ScenarioProposer.AltStat> alternatives, Boolean afterMaturity) {
	}

	static TypeRoleSubject of(ProductType type, Input input) {
		return new TypeRoleSubject(type, input, sha256(json(input)));
	}

	String json() {
		return json(input);
	}

	private static String json(Input input) {
		return JSON.writeValueAsString(input);
	}

	private static String sha256(String text) {
		try {
			return HexFormat.of().formatHex(MessageDigest.getInstance("SHA-256").digest(text.getBytes(StandardCharsets.UTF_8)));
		}
		catch (NoSuchAlgorithmException e) {
			throw new IllegalStateException(e);
		}
	}
}
