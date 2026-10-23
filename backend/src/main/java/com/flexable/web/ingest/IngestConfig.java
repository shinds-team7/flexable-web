package com.flexable.web.ingest;

import java.net.http.HttpClient;
import java.time.Clock;
import java.time.Duration;
import java.time.ZoneId;

import org.springframework.context.annotation.Bean;
import org.springframework.context.annotation.Configuration;
import org.springframework.context.annotation.Profile;
import org.springframework.http.client.JdkClientHttpRequestFactory;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.dart.DartDisclosureSource;
import com.flexable.web.ingest.fake.FakeDisclosureSource;
import com.flexable.web.ingest.fake.FakeInstrumentSource;
import com.flexable.web.ingest.fake.FakePriceSource;
import com.flexable.web.ingest.fake.FakeYouthPolicySource;
import com.flexable.web.ingest.kiwoom.KiwoomInstrumentSource;
import com.flexable.web.ingest.kiwoom.KiwoomPriceSource;
import com.flexable.web.ingest.kiwoom.KiwoomTokenClient;
import com.flexable.web.ingest.krx.KrxInstrumentSource;
import com.flexable.web.ingest.youthcenter.YouthCenterPolicySource;

/**
 * 수집 소스 선택. worker 프로필에서만 만든다(04 §8: 외부 호출은 worker만).
 * 새 소스는 PriceSource/InstrumentSource/DisclosureSource/YouthPolicySource를 구현하고 아래 switch에 이름을 하나 추가한다.
 */
@Configuration
@Profile("worker")
@EnableScheduling
public class IngestConfig {

	static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");

	/**
	 * JDK HttpClient를 쓴다. HttpURLConnection(SimpleClientHttpRequestFactory)은 키움 연속조회(next-key) 두 번째 요청에서
	 * 재사용한 keep-alive 연결의 응답을 끝까지 읽지 못하고 Read timed out이 났다(curl로는 정상, 2026-10-20 확인).
	 */
	private final RestClient http = RestClient.builder()
		.requestFactory(readTimeout(new JdkClientHttpRequestFactory(HttpClient.newBuilder()
			.version(HttpClient.Version.HTTP_1_1)
			.connectTimeout(Duration.ofSeconds(3))
			.build())))
		.build();

	private static JdkClientHttpRequestFactory readTimeout(JdkClientHttpRequestFactory f) {
		f.setReadTimeout(Duration.ofSeconds(10));
		return f;
	}

	/** 키움 토큰은 시세·종목정보가 함께 쓴다. 키가 없어도 만들어지고, 실제 호출 때 오류를 낸다. */
	@Bean
	KiwoomTokenClient kiwoomTokenClient(IngestProperties props, Clock clock) {
		IngestProperties.Kiwoom k = props.kiwoom();
		return new KiwoomTokenClient(http, k.baseUrl(), k.appKey(), k.secretKey(), clock);
	}

	@Bean
	PriceSource priceSource(IngestProperties props, KiwoomTokenClient tokens) {
		return switch (props.priceSource()) {
			case "kiwoom" -> new KiwoomPriceSource(http, props.kiwoom().baseUrl(), tokens, props.kiwoom().pageDelay());
			case "fake" -> new FakePriceSource();
			default -> throw new IllegalArgumentException("알 수 없는 MARKET_PRICE_SOURCE: " + props.priceSource());
		};
	}

	@Bean
	InstrumentSource instrumentSource(IngestProperties props, Clock clock, KiwoomTokenClient tokens) {
		InstrumentSource primary = instruments(props.instrumentSource(), props, clock, tokens);
		String fb = props.instrumentFallback();
		if ("none".equals(fb) || fb.isBlank() || fb.equals(props.instrumentSource())) {
			return primary;
		}
		return new FallbackInstrumentSource(primary, instruments(fb, props, clock, tokens));
	}

	@Bean
	DisclosureSource disclosureSource(IngestProperties props) {
		IngestProperties.Dart d = props.dart();
		return switch (props.disclosureSource()) {
			case "dart" -> new DartDisclosureSource(http, d.baseUrl(), d.apiKey(), d.callDelay());
			case "fake" -> new FakeDisclosureSource();
			case "none" -> new DartDisclosureSource(http, d.baseUrl(), null, d.callDelay()); // 키 없음 = 꺼짐
			default -> throw new IllegalArgumentException("알 수 없는 MARKET_DISCLOSURE_SOURCE: " + props.disclosureSource());
		};
	}

	@Bean
	YouthPolicySource youthPolicySource(IngestProperties props, Clock clock) {
		IngestProperties.Youth y = props.youth();
		return switch (y.source()) {
			case "youthcenter" -> new YouthCenterPolicySource(http, y.baseUrl(), y.apiKey(), y.pageSize(), y.maxPages(), y.callDelay(), clock, SEOUL);
			case "fake" -> new FakeYouthPolicySource();
			default -> throw new IllegalArgumentException("알 수 없는 YOUTH_POLICY_SOURCE: " + y.source());
		};
	}

	private InstrumentSource instruments(String name, IngestProperties props, Clock clock, KiwoomTokenClient tokens) {
		return switch (name) {
			case "krx" -> new KrxInstrumentSource(http, props.krx().baseUrl(), props.krx().authKey(), clock, SEOUL);
			case "kiwoom" -> new KiwoomInstrumentSource(http, props.kiwoom().baseUrl(), tokens, clock, SEOUL);
			case "fake" -> new FakeInstrumentSource();
			default -> throw new IllegalArgumentException("알 수 없는 종목 목록 소스: " + name);
		};
	}
}
