package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.market.MarketDtos.StockRef;
import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.VirtualSimStore;

/**
 * 전체 공시 수집(decisions/2026-11-04-virtual-simulation 1-8). 쪽마다 호출 수를 세어 실행당 상한을 지키고, 남은 쪽·종목은 다음 실행에 이어 받는지 본다(외부 호출 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:disclosure-archive;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class DisclosureArchiveJobTest {

	@Autowired
	MarketSyncJob sync;

	@Autowired
	MarketService market;

	@Autowired
	VirtualSimStore store;

	@Autowired
	IngestProperties props;

	@Autowired
	IngestRunRepository runs;

	@Autowired
	Clock clock;

	@Autowired
	JdbcTemplate jdbc;

	/** 종목마다 3쪽(쪽마다 2건)을 돌려주는 가짜 DART. 부른 (고유번호, 시작일, 끝일, 쪽)을 남긴다 */
	static final class PagedSource implements DisclosureSource {
		final List<String> calls = new ArrayList<>();
		boolean enabled = true;

		@Override
		public boolean enabled() {
			return enabled;
		}

		@Override
		public String url(Disclosure d) {
			return "https://example.com/" + d.receiptNo();
		}

		@Override
		public Map<String, String> corpCodes() {
			return Map.of();
		}

		@Override
		public List<Disclosure> disclosures(String corpCode, LocalDate from, LocalDate to) {
			return List.of();
		}

		@Override
		public Page page(String corpCode, LocalDate from, LocalDate to, int page) {
			calls.add(corpCode + " " + from + " " + to + " " + page);
			List<Disclosure> items = List.of(new Disclosure(corpCode.substring(2) + "0" + page + "1", "단일판매ㆍ공급계약체결", null, to),
					new Disclosure(corpCode.substring(2) + "0" + page + "2", "현금ㆍ현물배당결정", null, to.minusDays(page)));
			return new Page(items, 3);
		}

		@Override
		public Set<String> listedNames() {
			return Set.of();
		}
	}

	private IngestProperties props(String source, int cap) {
		var v = props.virtualSim();
		return new IngestProperties(props.priceSource(), props.instrumentSource(), props.instrumentFallback(), props.backfillYears(), props.recheckDays(),
				false, props.kiwoom(), props.krx(), source, props.dart(), props.youth(), props.gemini(), props.eventOverview(),
				new IngestProperties.VirtualSim(v.source(), null, null, v.batchSize(), v.maxCalls(), v.dailyCap(), cap));
	}

	@Test
	void 상한을_지키고_다음_실행에_이어_받아_다_받은_종목만_완료다() {
		sync.runOnce();
		market.setCorpCodes(Map.of("005930", "00126380", "000660", "00164779"));
		List<String> withCorp = market.rankedStocks().stream().filter(s -> s.corpCode() != null).map(StockRef::code).toList();
		assertThat(withCorp).containsExactlyInAnyOrder("005930", "000660");
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));

		// 키가 없거나 dart가 아니면 건너뛴다
		PagedSource off = new PagedSource();
		off.enabled = false;
		assertThat(new DisclosureArchiveJob(market, off, store, props("dart", 4), runs, clock).runOnce().status()).isEqualTo("SKIPPED");
		assertThat(new DisclosureArchiveJob(market, new PagedSource(), store, props("fake", 4), runs, clock).runOnce().status()).isEqualTo("SKIPPED");

		PagedSource dart = new PagedSource();
		var first = new DisclosureArchiveJob(market, dart, store, props("dart", 4), runs, clock).runOnce();
		assertThat(first.calls()).isEqualTo(4);
		assertThat(first.capped()).isTrue();
		assertThat(first.completed()).isEqualTo(1);
		assertThat(store.archivedStocks()).hasSize(1);
		String done = store.archivedStocks().getFirst();
		assertThat(store.archive(done).orElseThrow().coveredFrom()).isEqualTo(today.minusYears(5));
		String waiting = withCorp.stream().filter(c -> !c.equals(done)).findFirst().orElseThrow();
		var pending = store.archive(waiting).orElseThrow();
		assertThat(pending.complete()).isFalse();
		assertThat(pending.nextPage()).isEqualTo(2);

		// 다음 실행은 멈춘 쪽부터 이어 받고, 다 받은 종목은 오늘까지 받았으니 다시 부르지 않는다
		PagedSource next = new PagedSource();
		var second = new DisclosureArchiveJob(market, next, store, props("dart", 10), runs, clock).runOnce();
		assertThat(second.calls()).isEqualTo(2);
		assertThat(next.calls).allMatch(c -> c.startsWith(pending.corpCode() + " " + today.minusYears(5)));
		assertThat(next.calls.getFirst()).endsWith(" 2");
		assertThat(store.archivedStocks()).containsExactlyInAnyOrderElementsOf(withCorp);
		assertThat(store.disclosures("005930")).hasSize(6);
		assertThat(runs.findFirstByJobOrderByIdDesc(DisclosureArchiveJob.JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");

		// 같은 접수번호는 다시 넣지 않는다
		assertThat(store.saveDisclosures(List.of(new VirtualSimStore.DisclosureRow(store.disclosures("005930").getFirst().receiptNo(), "005930", "00126380",
				"단일판매ㆍ공급계약체결", today)))).isZero();
	}
}
