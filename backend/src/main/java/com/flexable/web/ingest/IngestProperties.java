package com.flexable.web.ingest;

import java.time.Duration;

import org.springframework.boot.context.properties.ConfigurationProperties;

/**
 * 외부 데이터 수집 설정(worker 프로필에서만 쓴다). 키는 환경 변수(backend/.env)로만 넣는다.
 * - priceSource: kiwoom | fake, instrumentSource: krx | kiwoom | fake, instrumentFallback: kiwoom | krx | fake | none
 * - backfillYears: 처음 받을 때 몇 년 전부터, recheckDays: 이후에는 마지막 거래일 며칠 전부터 다시 받아 정정을 반영
 * - disclosureSource: dart | fake | none (사건 근거 공시)
 * - youth: 청년 정책(소식) 수집. source: youthcenter | fake
 * - gemini: 소식 카드 요약(Gemini API). apiKey가 비어 있으면 요약하지 않는다(게시는 그대로)
 */
@ConfigurationProperties("app.ingest")
public record IngestProperties(String priceSource, String instrumentSource, String instrumentFallback, Integer backfillYears,
		Integer recheckDays, Boolean runOnStart, Kiwoom kiwoom, Krx krx, String disclosureSource, Dart dart, Youth youth, Gemini gemini) {

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
		youth = youth == null ? new Youth(null, null, null, null, null, null, null) : youth;
		gemini = gemini == null ? new Gemini(null, null, null, null, null, null) : gemini;
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

	/**
	 * 온통청년 청년정책 오픈API(youthcenter.go.kr). apiKey가 비어 있으면 수집을 건너뛴다.
	 * pageSize: 한 번에 받을 정책 수, maxPages: 한 번 실행의 페이지 상한, runOnStart: worker가 켜질 때 한 번 돌지, callDelay: 페이지 사이 쉬는 시간.
	 */
	public record Youth(String source, String baseUrl, String apiKey, Integer pageSize, Integer maxPages, Boolean runOnStart,
			Duration callDelay) {
		public Youth {
			source = source == null || source.isBlank() ? "youthcenter" : source;
			baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://www.youthcenter.go.kr" : baseUrl;
			pageSize = pageSize == null ? 100 : pageSize;
			maxPages = maxPages == null ? 100 : maxPages;
			runOnStart = runOnStart == null || runOnStart;
			callDelay = callDelay == null ? Duration.ofMillis(200) : callDelay;
		}
	}

	/**
	 * 소식 카드 요약(Gemini generateContent, 2026-10-26 결정). 무료 등급 한도가 있어 한 번에 batchSize건을 묶어 부르고,
	 * 한 번 실행에 maxCalls번까지만 부른다(남은 카드는 다음 실행). callDelay: 호출 사이 쉬는 시간(분당 한도).
	 */
	public record Gemini(String baseUrl, String apiKey, String model, Integer batchSize, Integer maxCalls, Duration callDelay) {
		public Gemini {
			baseUrl = baseUrl == null || baseUrl.isBlank() ? "https://generativelanguage.googleapis.com" : baseUrl;
			model = model == null || model.isBlank() ? "gemini-flash-lite-latest" : model;
			batchSize = batchSize == null ? 20 : batchSize;
			maxCalls = maxCalls == null ? 100 : maxCalls;
			callDelay = callDelay == null ? Duration.ofSeconds(7) : callDelay;
		}
	}
}
