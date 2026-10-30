package com.flexable.web.ingest;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 시장 띠 중 키움 밖 칸의 수집 설정(decisions/2026-10-26-invest-insight-redesign ⑤). KRX 칸은 기존 KRX 키(`app.ingest.krx`)를 쓴다.
 *
 * @param koreaeximBaseUrl 한국수출입은행 현재환율 API 주소
 * @param koreaeximAuthKey 한국수출입은행 인증키(KOREAEXIM_AUTH_KEY). 비어 있으면 환율 칸을 건너뛴다
 * @param krxBondIndexName KRX 채권지수 시세정보에서 고를 지수 그룹 이름(BND_IDX_GRP_NM)
 * @param krxGoldIsuCd KRX 금시장 일별매매정보에서 고를 종목 코드(ISU_CD)
 * @param callDelay 날짜별 호출 사이 쉬는 시간
 */
@ConfigurationProperties("app.ingest.indices")
public record MarketIndexProperties(String koreaeximBaseUrl, String koreaeximAuthKey, String krxBondIndexName, String krxGoldIsuCd,
		Duration callDelay) {

	public MarketIndexProperties {
		koreaeximBaseUrl = koreaeximBaseUrl == null || koreaeximBaseUrl.isBlank()
				? "https://oapi.koreaexim.go.kr/site/program/financial/exchangeJSON" : koreaeximBaseUrl;
		krxBondIndexName = krxBondIndexName == null || krxBondIndexName.isBlank() ? "KRX 채권지수" : krxBondIndexName.trim();
		krxGoldIsuCd = krxGoldIsuCd == null || krxGoldIsuCd.isBlank() ? "04020000" : krxGoldIsuCd.trim();
		callDelay = callDelay == null ? Duration.ofMillis(100) : callDelay;
	}
}
