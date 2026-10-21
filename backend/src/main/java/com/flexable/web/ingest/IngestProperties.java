package com.flexable.web.ingest;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 외부 데이터 수집 설정(worker 프로필에서만 쓴다). 키는 환경 변수(backend/.env)로만 넣는다.
 * - priceSource: kiwoom | fake, instrumentSource: krx | kiwoom | fake, instrumentFallback: kiwoom | krx | fake | none
 * - backfillYears: 처음 받을 때 몇 년 전부터, recheckDays: 이후에는 마지막 거래일 며칠 전부터 다시 받아 정정을 반영
 * - disclosureSource: dart | fake | none (사건 근거 공시)
 */
@ConfigurationProperties("app.ingest")
public record IngestProperties(String priceSource, String instrumentSource, String instrumentFallback, Integer backfillYears,
		Integer recheckDays, Boolean runOnStart, Kiwoom kiwoom, Krx krx, String disclosureSource, Dart dart) {

	public IngestProperties {
		priceSource = priceSource == null ? "kiwoom" : priceSource;
		instrumentSource = instrumentSource == null ? "krx" : instrumentSource;
		instrumentFallback = instrumentFallback == null ? "none" : instrumentFallback;
		backfillYears = backfillYears == null ? 5 : backfillYears;
		recheckDays = recheckDays == null ? 10 : recheckDays;
		runOnStart = runOnStart == null || runOnStart;
		kiwoom = kiwoom == null ? new Kiwoom(null, null, null, null) : kiwoom;
		krx = krx == null ? new Krx(null, null) : krx;
		disclosureSource = disclosureSource == null ? "dart" : disclosureSource;
		dart = dart == null ? new Dart(null, null, null, null) : dart;
	}

	public record Kiwoom(String baseUrl, String appKey, String secretKey, Duration pageDelay) {
		public Kiwoom {
			baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://api.kiwoom.com" : baseUrl;
			pageDelay = pageDelay == null ? Duration.ofMillis(250) : pageDelay;
		}
	}

	public record Krx(String baseUrl, String authKey) {
		public Krx {
			baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://data-dbg.krx.co.kr/svc/apis" : baseUrl;
		}
	}

	/** maxCalls: 한 번 실행에서 공시를 찾을 사건 수 상한(하루 20,000건 한도 안에서), callDelay: 호출 사이 쉬는 시간. */
	public record Dart(String baseUrl, String apiKey, Integer maxCalls, Duration callDelay) {
		public Dart {
			baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://opendart.fss.or.kr" : baseUrl;
			maxCalls = maxCalls == null ? 5000 : maxCalls;
			callDelay = callDelay == null ? Duration.ofMillis(100) : callDelay;
		}
	}
}
