package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.Archive;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;

/**
 * 배치고사 공시 주요 내용 수집(decisions/2026-11-05-virtual-sim-contest 2-2). 호출 상한에 닿으면 멈추고, 실패해도 공시 목록은 그대로이며,
 * 다시 돌려도 같은 행인지 본다(외부 호출 없음).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:disclosure-detail;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class DisclosureDetailJobTest {

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

	/** 가짜 DART DS005. 부른 (API, 고유번호)를 남기고, failing에 든 API는 실패한다 */
	static final class Ds005 implements DisclosureSource {
		final List<String> calls = new ArrayList<>();
		final Set<String> failing = new HashSet<>();
		final Map<String, List<Map<String, String>>> rows;

		Ds005(Map<String, List<Map<String, String>>> rows) {
			this.rows = rows;
		}

		@Override
		public boolean enabled() {
			return true;
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
		public List<Map<String, String>> majorReport(String api, String corpCode, LocalDate from, LocalDate to) {
			calls.add(api + " " + corpCode);
			if (failing.contains(api)) {
				throw new IllegalStateException("DART 호출 실패: 연결 끊김");
			}
			return rows.getOrDefault(api + " " + corpCode, List.of());
		}
	}

	private IngestProperties props(String source) {
		return new IngestProperties(props.priceSource(), props.instrumentSource(), props.instrumentFallback(), props.backfillYears(), props.recheckDays(),
				false, props.kiwoom(), props.krx(), source, props.dart(), props.youth(), props.gemini(), props.eventOverview(), props.virtualSim());
	}

	private List<Map<String, Object>> detailRows() {
		return jdbc.queryForList("SELECT receipt_no, category, items, version, collected_at FROM dart_disclosure_details ORDER BY receipt_no");
	}

	@Test
	void 상한에서_멈추고_실패는_다음에_다시_받고_다시_돌려도_같은_행이다() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		store.saveDisclosures(List.of(new DisclosureRow("20250101000001", "111111", "00000001", "주요사항보고서(유상증자결정)", today.minusDays(30)),
				new DisclosureRow("20250101000002", "111111", "00000001", "주요사항보고서(유상증자결정)", today.minusDays(10)),
				new DisclosureRow("20250101000003", "111111", "00000001", "[기재정정]주요사항보고서(전환사채권발행결정)", today.minusDays(5)),
				new DisclosureRow("20250101000004", "111111", "00000001", "현금ㆍ현물배당결정", today.minusDays(5)),
				new DisclosureRow("20190101000005", "111111", "00000001", "주요사항보고서(유상증자결정)", today.minusYears(6)),
				new DisclosureRow("20250101000006", "222222", "00000002", "주요사항보고서(자기주식취득결정)", today.minusDays(3)),
				new DisclosureRow("20250101000007", "333333", "00000003", "주요사항보고서(유상증자결정)", today.minusDays(3))));
		store.saveArchive(new Archive("111111", "00000001", today.minusYears(5), today, null, null, null));
		store.saveArchive(new Archive("222222", "00000002", today.minusYears(5), today, null, null, null));
		// 이어 받는 중인 종목은 아직 대상이 아니다
		store.saveArchive(new Archive("333333", "00000003", null, null, today.minusYears(5), today, 2));
		int disclosures = jdbc.queryForObject("SELECT COUNT(*) FROM dart_disclosures", Integer.class);

		Ds005 dart = new Ds005(Map.of(
				"piicDecsn 00000001", List.of(Map.of("rcept_no", "20250101000001", "corp_name", "예시전자", "nstk_ostk_cnt", "2,500,000", "bfic_tisstk_ostk", "20,000,000",
						"ic_mthn", "제3자배정증자")),
				"cvbdIsDecsn 00000001", List.of(Map.of("rcept_no", "20250101000003", "bd_fta", "30,000,000,000", "rpmcmp", "예시증권")),
				"tsstkAqDecsn 00000002", List.of(Map.of("rcept_no", "20250101000006", "aqpln_prc_ostk", "5,000,000,000", "aq_mth", "장내 직접 취득"))));

		// 키가 없거나 dart가 아니면 건너뛴다
		assertThat(new DisclosureDetailJob(dart, store, props("fake"), runs, clock).runOnce(10).status()).isEqualTo("SKIPPED");
		assertThat(dart.calls).isEmpty();

		// 상한 1번: 첫 종목의 첫 API만 부르고 멈춘다
		var first = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(1);
		assertThat(first.capped()).isTrue();
		assertThat(dart.calls).containsExactly("piicDecsn 00000001");
		assertThat(runs.findFirstByJobOrderByIdDesc(DisclosureDetailJob.JOB).orElseThrow().getError()).contains("호출 상한 1번");
		// 응답에 있던 공시는 항목을, 없던 공시는 빈 항목을 저장한다(다시 부르지 않게). 5년보다 오래된 공시·구조화 자료가 없는 유형은 받지 않는다
		assertThat(store.details("111111")).containsOnlyKeys("20250101000001");
		assertThat(store.details("111111").get("20250101000001")).extracting(d -> d.label() + "=" + d.value())
			.containsExactly("새 주식 수(기존 대비)=12.5%", "증자 방식=제3자배정");
		assertThat(store.detailedReceipts("111111")).containsExactlyInAnyOrder("20250101000001", "20250101000002");

		// 사채 API가 실패해도 공시 목록은 그대로고, 그 공시는 저장하지 않아 다음 실행에 다시 받는다
		dart.failing.add("cvbdIsDecsn");
		var second = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);
		assertThat(second.status()).isEqualTo("PARTIAL");
		assertThat(second.errors()).singleElement().asString().contains("cvbdIsDecsn").doesNotContain("crtfc_key");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM dart_disclosures", Integer.class)).isEqualTo(disclosures);
		assertThat(store.detailedReceipts("111111")).doesNotContain("20250101000003");
		assertThat(store.details("222222")).containsOnlyKeys("20250101000006");

		dart.failing.clear();
		dart.calls.clear();
		var third = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);
		assertThat(third.status()).isEqualTo("SUCCESS");
		assertThat(dart.calls).containsExactly("cvbdIsDecsn 00000001");
		assertThat(store.details("111111").get("20250101000003")).extracting(d -> d.value()).containsExactly("전환사채", "100억~500억 원");

		// 다시 돌리면 부르지 않고 행도 같다
		List<Map<String, Object>> before = detailRows();
		dart.calls.clear();
		var again = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);
		assertThat(again.calls()).isZero();
		assertThat(detailRows()).isEqualTo(before);
		// 회사·상대방 이름은 저장하지 않는다
		assertThat(before).allSatisfy(r -> assertThat(String.valueOf(r.get("items"))).doesNotContain("예시전자").doesNotContain("예시증권"));
	}

	@Test
	void 정정된_원_공시는_정정본_값을_쓰고_종속회사_공시는_부르지_않는다() throws Exception {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		assertThat(DisclosureDetailJob.CORRECTION_DAYS).isEqualTo(tools.jackson.databind.json.JsonMapper.builder().build()
			.readTree(java.nio.file.Files.readString(java.nio.file.Path.of("..", "tests", "policy", "virtual-contest.json")))
			.get("placementDetails").get("corrections").get("days").asInt());
		store.saveDisclosures(List.of(new DisclosureRow("20250201000001", "444444", "00000004", "주요사항보고서(유상증자결정)", today.minusDays(40)),
				new DisclosureRow("20250201000002", "444444", "00000004", "[기재정정]주요사항보고서(유상증자결정)", today.minusDays(35)),
				new DisclosureRow("20250201000003", "444444", "00000004", "[기재정정]주요사항보고서(유상증자결정)", today.minusDays(30)),
				// 그 뒤 새 원 공시(다른 유상증자). 응답에 없으면 앞 공시의 정정본을 빌려 쓰지 않는다
				new DisclosureRow("20250201000004", "444444", "00000004", "주요사항보고서(유상증자결정)", today.minusDays(10)),
				new DisclosureRow("20250201000005", "444444", "00000004", "유상증자결정(종속회사의주요경영사항)", today.minusDays(5))));
		store.saveArchive(new Archive("444444", "00000004", today.minusYears(5), today, null, null, null));
		// DS005는 마지막 정정본(…003)만 돌려준다
		Ds005 dart = new Ds005(Map.of("piicDecsn 00000004", List.of(Map.of("rcept_no", "20250201000003", "nstk_ostk_cnt", "1,000,000", "bfic_tisstk_ostk",
				"10,000,000"))));

		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);

		assertThat(dart.calls).containsExactly("piicDecsn 00000004");
		var got = store.details("444444");
		assertThat(got).containsOnlyKeys("20250201000001", "20250201000002", "20250201000003");
		assertThat(got.values()).allSatisfy(items -> assertThat(items).extracting(d -> d.value()).containsExactly("10.0%"));
		// 종속회사 공시는 대상이 아니라 행도 없다
		assertThat(store.detailedReceipts("444444")).contains("20250201000004").doesNotContain("20250201000005");
	}
}
