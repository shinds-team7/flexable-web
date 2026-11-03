package com.flexable.web.market;

import static org.assertj.core.api.Assertions.assertThat;

import java.io.IOException;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.List;
import java.util.Locale;
import java.util.Map;

import org.assertj.core.api.SoftAssertions;
import org.junit.jupiter.api.BeforeAll;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.condition.EnabledIfEnvironmentVariable;

import com.flexable.web.market.EventDetector.Detected;

/**
 * 실데이터 검증(로컬 전용). EVENT_BASELINE_DB_URL이 있을 때만 돈다(RealData 참고). 2020-03·2024-08 폭락이 시장 사건으로 잡히는지,
 * 탐지한 사건 목록이 저장해 둔 목록(EVENT_BASELINE_SNAPSHOT)과 같은지 본다. 저장 파일이 없으면 지금 결과를 저장한다.
 * stock()·market()만 써서 리팩터링 전 코드에서도 그대로 돌려 비교 기준을 만들 수 있다. 저장 파일은 저장소에 넣지 않는다.
 */
@EnabledIfEnvironmentVariable(named = RealData.DB_URL, matches = ".+")
class EventDetectorRealDataTest {

	private static RealData.Loaded data;

	@BeforeAll
	static void load() throws Exception {
		data = RealData.load();
	}

	@Test
	void 폭락은_시장_사건으로_잡힌다() {
		List<Detected> market = EventDetector.market(data.proxy().bars());
		SoftAssertions soft = new SoftAssertions();
		for (YearMonth ym : List.of(YearMonth.of(2020, 3), YearMonth.of(2024, 8))) {
			List<Detected> in = market.stream().filter(e -> YearMonth.from(e.start()).equals(ym)).toList();
			System.out.println("[실데이터] " + ym + " 시장 사건: " + in.stream().map(e -> e.start() + " " + e.direction() + " "
					+ String.format(Locale.ROOT, "%.2f%%", e.returnRate() * 100)).toList());
			soft.assertThat(in).as(ym + " 시장 하락 사건(시세 시작 " + data.proxy().bars().getFirst().date() + ")")
				.anyMatch(e -> "FALL".equals(e.direction()));
		}
		soft.assertAll();
	}

	@Test
	void 사건_목록이_저장본과_같다() throws IOException {
		List<String> now = lines();
		String path = System.getenv("EVENT_BASELINE_SNAPSHOT");
		if (path == null || path.isBlank()) {
			System.out.println("[실데이터] EVENT_BASELINE_SNAPSHOT이 없어 비교를 건너뜀 (사건 " + now.size() + "건)");
			return;
		}
		Path file = Path.of(path);
		if (!Files.exists(file)) {
			Files.write(file, now);
			System.out.println("[실데이터] 저장본이 없어 지금 결과를 저장함: " + file + " (사건 " + now.size() + "건)");
			return;
		}
		List<String> saved = Files.readAllLines(file);
		System.out.println("[실데이터] 저장본 " + saved.size() + "건, 지금 " + now.size() + "건");
		assertThat(now).containsExactlyElementsOf(saved);
	}

	/** 종목·범위·기간·방향·순위·z·점수. 실수는 소수 9자리로 적는다(같은 코드면 비트까지 같아야 한다). */
	private static List<String> lines() {
		List<String> out = new ArrayList<>();
		Map<LocalDate, Long> market = EventDetector.closes(data.proxy().bars());
		data.stocks().forEach(s -> EventDetector.stock(s.bars(), market, s.etf())
			.forEach(e -> out.add(line(s.code(), "STOCK", e))));
		EventDetector.market(data.proxy().bars()).forEach(e -> out.add(line(data.proxy().code(), "MARKET", e)));
		return out;
	}

	private static String line(String code, String scope, Detected e) {
		return String.join(",", code, scope, e.start().toString(), e.end().toString(), e.direction(), String.valueOf(e.rankInYear()),
				String.format(Locale.ROOT, "%.9f", e.zScore()), String.format(Locale.ROOT, "%.9f", e.score()),
				String.format(Locale.ROOT, "%.9f", e.returnRate()));
	}
}
