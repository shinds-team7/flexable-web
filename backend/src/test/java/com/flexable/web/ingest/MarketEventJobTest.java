package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.market.DailyClose;
import com.flexable.web.market.EventDtos.AiSummary;
import com.flexable.web.market.EventDtos.EventView;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketService;

/**
 * worker 프로필 + 가짜 소스로 시세 수집 → 사건 탐지 → 공시 근거를 돌린다(외부 호출 없음).
 * 가짜 시세에는 급변동이 없어서, 삼성전자·KODEX 200 종가를 고정 난수 시계열로 덮어쓰고 하루 +20%를 넣는다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:events;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class MarketEventJobTest {

	@Autowired
	MarketSyncJob sync;

	@Autowired
	MarketEventJob job;

	@Autowired
	MarketService market;

	@Autowired
	EventService events;

	@Test
	void 급등을_사건으로_저장하고_공시_근거를_붙인다() {
		sync.runOnce();
		List<LocalDate> dates = market.dailyCloses("005930", LocalDate.of(2000, 1, 1)).stream().map(DailyClose::date).toList();
		int jump = dates.size() - 100;
		Random rnd = new Random(11);
		List<DailyClose> proxy = new ArrayList<>();
		List<DailyClose> stock = new ArrayList<>();
		double m = Math.log(30_000), s = Math.log(60_000);
		for (int i = 0; i < dates.size(); i++) {
			if (i > 0) {
				double mr = rnd.nextGaussian() * 0.008;
				m += mr;
				s += mr + rnd.nextGaussian() * 0.005 + (i == jump ? Math.log(1.2) : 0);
			}
			proxy.add(new DailyClose(dates.get(i), Math.round(Math.exp(m))));
			stock.add(new DailyClose(dates.get(i), Math.round(Math.exp(s))));
		}
		market.saveDailyCloses("069500", proxy, Map.of(), "테스트");
		market.saveDailyCloses("005930", stock, Map.of(), "테스트");

		MarketEventJob.Result first = job.runOnce();
		assertThat(first.errors()).isEmpty();
		assertThat(first.status()).isEqualTo("SUCCESS");

		// 고정 난수 시계열이라 우연한 5일 사건이 더 있을 수 있다. 넣은 급등만 확인한다
		List<EventView> samsung = events.events("005930");
		EventView e = samsung.stream().filter(x -> x.startDate().equals(dates.get(jump))).findFirst().orElseThrow();
		assertThat(e.scope()).isEqualTo("STOCK");
		assertThat(e.windowDays()).isEqualTo(1);
		assertThat(e.returnRate()).isGreaterThan(0.15);
		assertThat(e.direction()).isEqualTo("RISE");
		// 가짜 공시 2건 중 공급계약만 근거로 남는다(임원 지분 보고는 빼기)
		assertThat(e.sources()).hasSize(1);
		assertThat(e.sources().getFirst().title()).isEqualTo("단일판매ㆍ공급계약체결");
		assertThat(e.sources().getFirst().type()).isEqualTo("DART");
		assertThat(e.sources().getFirst().date()).isEqualTo(dates.get(jump));
		assertThat(e.sources().getFirst().url()).startsWith("https://example.com/disclosures/");
		// 테스트는 예시 작성기(EVENT_OVERVIEW_SOURCE=fake): 근거를 찾은 뒤 개요를 쓰고 isSample로 저장한다
		assertThat(first.overview().status()).isEqualTo("SUCCESS");
		assertThat(first.overview().saved()).isPositive();
		AiSummary overview = events.detail(e.id()).orElseThrow().aiSummary();
		assertThat(overview.isSample()).isTrue();
		assertThat(overview.model()).isEqualTo("sample");
		assertThat(overview.text()).startsWith("삼성전자 주가는 ").contains("단일판매ㆍ공급계약체결 공시가 있었어요");

		// 다시 돌려도 같은 사건을 갱신만 하고(id 유지), 이미 찾은 근거는 다시 받지 않는다
		MarketEventJob.Result second = job.runOnce();
		assertThat(second.status()).isEqualTo("SUCCESS");
		assertThat(second.evidenceChecked()).isZero();
		assertThat(second.overview().targets()).isZero(); // 입력이 그대로면 개요도 다시 만들지 않는다
		assertThat(events.events("005930")).containsExactlyElementsOf(samsung);
	}
}
