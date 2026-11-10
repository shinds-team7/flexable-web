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
	static class Ds005 implements DisclosureSource {
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
				false, props.kiwoom(), props.krx(), source, props.dart(), props.youth(), props.gemini(), props.eventOverview(), props.virtualSim(), props.placementSummary());
	}

	/** 테스트끼리 같은 메모리 DB를 쓰므로 순서와 상관없게 비운다 */
	@org.junit.jupiter.api.BeforeEach
	void clean() {
		for (String t : List.of("dart_disclosure_details", "dart_detail_failures", "dart_disclosure_archive", "dart_disclosures")) {
			jdbc.update("DELETE FROM " + t);
		}
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

	@Test
	void 나중에_정정되면_이미_받은_원_공시도_정정된_값으로_다시_평가한다() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		store.saveDisclosures(List.of(new DisclosureRow("20250301000001", "555555", "00000005", "주요사항보고서(전환사채권발행결정)", today.minusDays(20)),
				new DisclosureRow("20250301000011", "555555", "00000005", "주요사항보고서(자기주식처분결정)", today.minusDays(20))));
		store.saveArchive(new Archive("555555", "00000005", today.minusYears(5), today, null, null, null));
		Map<String, List<Map<String, String>>> rows = new java.util.HashMap<>();
		rows.put("cvbdIsDecsn 00000005", List.of(Map.of("rcept_no", "20250301000001", "bd_fta", "3,000,000,000")));
		rows.put("tsstkDpDecsn 00000005", List.of(Map.of("rcept_no", "20250301000011", "dppln_prc_ostk", "3,000,000,000")));
		Ds005 dart = new Ds005(rows);
		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);
		assertThat(store.details("555555").get("20250301000001")).extracting(d -> d.value()).contains("10억~50억 원");

		// 정정 공시가 들어오고 DS005는 정정본만 돌려준다 → 원 공시도 정정된 규모로 바뀐다
		store.saveDisclosures(List.of(new DisclosureRow("20250301000002", "555555", "00000005", "[기재정정]주요사항보고서(전환사채권발행결정)", today.minusDays(15)),
				new DisclosureRow("20250301000012", "555555", "00000005", "[기재정정]주요사항보고서(자기주식처분결정)", today.minusDays(15))));
		rows.put("cvbdIsDecsn 00000005", List.of(Map.of("rcept_no", "20250301000002", "bd_fta", "30,000,000,000")));
		// 처분은 원본 행도 함께 돌려준다 → 원 공시는 자기 행 값을 그대로 쓴다
		rows.put("tsstkDpDecsn 00000005", List.of(Map.of("rcept_no", "20250301000011", "dppln_prc_ostk", "3,000,000,000"),
				Map.of("rcept_no", "20250301000012", "dppln_prc_ostk", "60,000,000,000")));
		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);

		var got = store.details("555555");
		assertThat(got.get("20250301000001")).extracting(d -> d.value()).contains("100억~500억 원").doesNotContain("10억~50억 원");
		assertThat(got.get("20250301000002")).extracting(d -> d.value()).contains("100억~500억 원");
		assertThat(got.get("20250301000011")).extracting(d -> d.value()).contains("10억~50억 원");
		assertThat(got.get("20250301000012")).extracting(d -> d.value()).contains("500억~1천억 원");
	}

	@Test
	void 계속_실패하는_묶음이_상한을_다_써도_다음_실행은_다음_묶음부터_받는다() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		store.saveDisclosures(List.of(new DisclosureRow("20250401000001", "666661", "00000061", "주요사항보고서(유상증자결정)", today.minusDays(9)),
				new DisclosureRow("20250401000002", "666662", "00000062", "주요사항보고서(유상증자결정)", today.minusDays(9)),
				new DisclosureRow("20250401000003", "666663", "00000063", "주요사항보고서(유상증자결정)", today.minusDays(9))));
		for (String n : List.of("1", "2", "3")) {
			store.saveArchive(new Archive("66666" + n, "0000006" + n, today.minusYears(5), today, null, null, null));
		}
		// 첫 종목은 늘 형식 오류(정상 상태인데 list 없음 같은)로 실패한다
		Ds005 dart = new Ds005(Map.of("piicDecsn 00000062", List.of(Map.of("rcept_no", "20250401000002", "bfic_tisstk_ostk", "100", "nstk_ostk_cnt", "10")),
				"piicDecsn 00000063", List.of(Map.of("rcept_no", "20250401000003", "bfic_tisstk_ostk", "100", "nstk_ostk_cnt", "20")))) {
			@Override
			public List<Map<String, String>> majorReport(String api, String corpCode, LocalDate from, LocalDate to) {
				if (corpCode.equals("00000061")) {
					calls.add(api + " " + corpCode);
					throw new IllegalStateException("DS005 piicDecsn 응답 형식 오류: 정상(000)인데 list가 없어요");
				}
				return super.majorReport(api, corpCode, from, to);
			}
		};

		var r1 = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(1);
		assertThat(dart.calls).containsExactly("piicDecsn 00000061");
		assertThat(r1.status()).isEqualTo("FAILED");
		// 형식 오류는 빈 결과로 저장하지 않는다(다시 받는다)
		assertThat(store.detailedReceipts("666661")).isEmpty();

		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(1);
		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(1);
		assertThat(dart.calls).containsExactly("piicDecsn 00000061", "piicDecsn 00000062", "piicDecsn 00000063");
		assertThat(store.detailedReceipts("666662")).containsExactly("20250401000002");
		assertThat(store.detailedReceipts("666663")).containsExactly("20250401000003");

		// 다른 묶음을 다 받은 뒤 실패한 묶음을 다시 시도한다
		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(1);
		assertThat(dart.calls).containsExactly("piicDecsn 00000061", "piicDecsn 00000062", "piicDecsn 00000063", "piicDecsn 00000061");
		assertThat(jdbc.queryForObject("SELECT attempts FROM dart_detail_failures WHERE stock_code = '666661'", Integer.class)).isEqualTo(2);
	}

	/** 공급 계약: 원공시마다 원문을 한 번 받아 매출액 대비·계약 기간만 저장하고, 정정·자회사 공시와 원문은 받거나 저장하지 않는다(Issue #375) */
	@Test
	void 공급_계약은_원공시_원문에서_두_칸만_뽑는다() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		store.saveDisclosures(List.of(new DisclosureRow("20250501000001", "777777", "00000077", "단일판매ㆍ공급계약체결", today.minusDays(20)),
				new DisclosureRow("20250501000002", "777777", "00000077", "[기재정정]단일판매ㆍ공급계약체결", today.minusDays(10)),
				new DisclosureRow("20250501000003", "777777", "00000077", "단일판매ㆍ공급계약체결(자회사의 주요경영사항)", today.minusDays(9)),
				new DisclosureRow("20250501000004", "777777", "00000077", "단일판매ㆍ공급계약체결(자율공시)", today.minusDays(5))));
		store.saveArchive(new Archive("777777", "00000077", today.minusYears(5), today, null, null, null));
		List<String> docs = new ArrayList<>();
		Ds005 dart = new Ds005(Map.of()) {
			@Override
			public String documentText(String receiptNo) {
				docs.add(receiptNo);
				return receiptNo.endsWith("1") ? "1. 계약상대방 | 누리소재(주)\n2. 계약내역 | 계약금액(원) | 1,000,000,000\n매출액 대비(%) | 3.45\n5. 계약기간 | 시작일 | 2025-01-01\n종료일 | 2025-06-30"
						: null;
			}
		};

		// 상한 1번: 최근 원공시부터 한 건
		var first = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(1);
		assertThat(first.capped()).isTrue();
		assertThat(docs).containsExactly("20250501000004");
		var second = new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);
		assertThat(second.status()).isEqualTo("SUCCESS");
		assertThat(docs).containsExactly("20250501000004", "20250501000001");
		assertThat(dart.calls).isEmpty();
		// 원문이 없던 공시는 빈 항목으로 저장해 다시 받지 않는다. 금액·상대방·날짜는 저장하지 않는다
		assertThat(store.details("777777")).containsOnlyKeys("20250501000001");
		assertThat(store.details("777777").get("20250501000001")).containsExactly(new com.flexable.web.virtualsim.PlacementDetails.Detail("매출액 대비", "3.4%"),
				new com.flexable.web.virtualsim.PlacementDetails.Detail("계약 기간", "6개월"));
		String saved = String.join(" ", jdbc.queryForList("SELECT items FROM dart_disclosure_details", String.class));
		assertThat(saved).doesNotContain("누리소재").doesNotContain("1,000,000,000").doesNotContain("2025");
		new DisclosureDetailJob(dart, store, props("dart"), runs, clock).runOnce(10);
		assertThat(docs).hasSize(2);
	}
}
