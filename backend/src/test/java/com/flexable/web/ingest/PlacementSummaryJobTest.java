package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.ingest.dart.DartDisclosureSource;
import com.flexable.web.market.MarketService;
import com.flexable.web.virtualsim.PlacementDetails;
import com.flexable.web.virtualsim.PlacementSummaries;
import com.flexable.web.virtualsim.VirtualSimCategory;
import com.flexable.web.virtualsim.VirtualSimStore;
import com.flexable.web.virtualsim.VirtualSimStore.Archive;
import com.flexable.web.virtualsim.VirtualSimStore.DetailRow;
import com.flexable.web.virtualsim.VirtualSimStore.DisclosureRow;

/**
 * 배치고사 공시 AI 요약(decisions/2026-11-09-placement-ai-summary): 대상·순서, 원문이 없는 공시, 검사에 걸린 요약, 같은 입력을 다시 부르지 않음,
 * 한 번 실행 상한·하루 상한, 키가 없거나 호출이 실패할 때, 운영자 숨김을 본다(외부 호출 없음, 작성기는 가짜이고 검사는 실제 PlacementSummaries.check).
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:placement-summary;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class PlacementSummaryJobTest {

	@Autowired
	VirtualSimStore store;
	@Autowired
	MarketService market;
	@Autowired
	GeminiDailyUsage usage;
	@Autowired
	IngestProperties props;
	@Autowired
	IngestRunRepository runs;
	@Autowired
	Clock clock;
	@Autowired
	JdbcTemplate jdbc;

	/** 가짜 OpenDART 공시서류원본파일. 부른 접수번호를 남기고, texts에 없는 공시는 원문 파일이 없다(null) */
	static class Documents implements DisclosureSource {
		final List<String> calls = new ArrayList<>();
		final Map<String, String> texts = new HashMap<>();
		RuntimeException fail;

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
		public String documentText(String receiptNo) {
			calls.add(receiptNo);
			if (fail != null) {
				throw fail;
			}
			return texts.get(receiptNo);
		}

		@Override
		public Set<String> listedNames() {
			return Set.of("가람전자", "누리"); // 두 글자 상장사 이름은 막지 않는다(흔한 낱말과 겹친다)
		}
	}

	/** 가짜 작성기: 접수번호마다 정해 둔 답(다시 쓰기는 rewrites, 없으면 replies)을 실제 검사(PlacementSummaries.check)에 넣는다. 받은 입력을 남긴다 */
	static class Writer implements PlacementSummaryWriter {
		boolean enabled = true;
		RuntimeException fail;
		final Map<String, String> replies = new HashMap<>();
		final Map<String, String> rewrites = new HashMap<>();
		final List<List<Input>> calls = new ArrayList<>();
		final List<List<Retry>> retried = new ArrayList<>();

		@Override
		public boolean enabled() {
			return enabled;
		}

		@Override
		public String model() {
			return "test-model";
		}

		@Override
		public List<Result> write(List<Input> batch) {
			calls.add(batch);
			if (fail != null) {
				throw fail;
			}
			// 정해 둔 답이 없는 공시는 응답에서 빠진 것으로 본다
			return batch.stream().filter(in -> replies.containsKey(in.id())).map(in -> result(in, replies.get(in.id()))).toList();
		}

		@Override
		public List<Result> rewrite(List<Retry> retries) {
			retried.add(retries);
			return retries.stream().map(r -> result(r.input(), rewrites.getOrDefault(r.input().id(), replies.get(r.input().id())))).toList();
		}

		private static Result result(Input in, String text) {
			PlacementSummaries.Verdict v = PlacementSummaries.check(text, in.text(), in.names());
			return v.ok() ? new Result(in.id(), v.summary(), null) : new Result(in.id(), null, v.reject().name(), PlacementSummaries.feedback(v), text);
		}
	}

	private IngestProperties props(String source, int batchSize, int maxCalls, int dailyCap) {
		return new IngestProperties(props.priceSource(), props.instrumentSource(), props.instrumentFallback(), props.backfillYears(), props.recheckDays(), false,
				props.kiwoom(), props.krx(), source, props.dart(), props.youth(), props.gemini(), props.eventOverview(), props.virtualSim(),
				new IngestProperties.PlacementSummary("gemini", null, null, batchSize, maxCalls, dailyCap));
	}

	private PlacementSummaryJob job(Documents dart, Writer writer, IngestProperties p) {
		return new PlacementSummaryJob(dart, store, market, writer, usage, p, runs, clock);
	}

	@BeforeEach
	void clean() {
		for (String t : List.of("dart_disclosure_summaries", "dart_disclosure_details", "dart_disclosure_archive", "dart_disclosures", "gemini_daily_usage")) {
			jdbc.update("DELETE FROM " + t);
		}
	}

	private static final String TABLE = "1. 계약상대방 | 누리소재(주)\n2. 계약금액(원) | 12,345,678,900\n3. 최근 매출액 대비(%) | 8.57\n";
	private static final String OK = "이 회사가 다른 회사와 설비 공급 계약을 맺었다고 알렸어요. 계약 금액은 100억~500억 원 규모로 최근 매출액의 8.5%에 해당해요.";

	private Documents seed() {
		LocalDate today = LocalDate.now(clock.withZone(IngestConfig.SEOUL));
		store.saveDisclosures(List.of(new DisclosureRow("20250101000001", "111111", "00000001", "주요사항보고서(유상증자결정)", today.minusDays(40)),
				new DisclosureRow("20250101000002", "111111", "00000001", "단일판매ㆍ공급계약체결", today.minusDays(30)),
				new DisclosureRow("20250101000003", "111111", "00000001", "단일판매ㆍ공급계약체결", today.minusDays(20)),
				new DisclosureRow("20250101000004", "111111", "00000001", "기업설명회(IR)개최", today.minusDays(10)),
				new DisclosureRow("20190101000005", "111111", "00000001", "단일판매ㆍ공급계약체결", today.minusYears(6)),
				// 이어 받는 중인 종목은 아직 대상이 아니다
				new DisclosureRow("20250101000006", "333333", "00000003", "단일판매ㆍ공급계약체결", today.minusDays(3))));
		store.saveArchive(new Archive("111111", "00000001", today.minusYears(5), today, null, null, null));
		store.saveArchive(new Archive("333333", "00000003", null, null, today.minusYears(5), today, 2));
		// 유상증자 공시는 주요 내용이 있어 맨 뒤로 간다
		store.saveDetails(List.of(new DetailRow("20250101000001", VirtualSimCategory.NEW_SHARES, List.of(new PlacementDetails.Detail("증자 방식", "제3자배정")))));
		Documents dart = new Documents();
		dart.texts.put("20250101000001", "1. 증자방식 | 제3자배정증자\n2. 신주의 종류와 수 | 보통주식 | 2,500,000\n");
		dart.texts.put("20250101000003", TABLE + "본문 ".repeat(PlacementSummaries.MAX_SOURCE_CHARS));
		// 20250101000002는 원문 파일이 없다
		return dart;
	}

	private Map<String, Map<String, Object>> rows() {
		Map<String, Map<String, Object>> out = new HashMap<>();
		jdbc.queryForList("SELECT * FROM dart_disclosure_summaries").forEach(r -> out.put((String) r.get("receipt_no"), r));
		return out;
	}

	@Test
	void 주요_내용이_없는_최근_공시부터_만들고_같은_입력은_다시_부르지_않는다() {
		Documents dart = seed();
		Writer writer = new Writer();
		writer.replies.put("20250101000003", OK);
		writer.replies.put("20250101000001", "이 회사가 제3자배정 유상증자를 결정했어요. 새 주식은 기존 주식 수의 12.5%예요."); // 원문에 없는 %

		// 공시 소스가 dart가 아니거나 키가 없으면 건너뛴다
		assertThat(job(dart, writer, props("fake", 1, 2, 10)).runOnce().status()).isEqualTo("SKIPPED");
		writer.enabled = false;
		assertThat(job(dart, writer, props("dart", 1, 2, 10)).runOnce().status()).isEqualTo("SKIPPED");
		assertThat(dart.calls).isEmpty();
		writer.enabled = true;

		// 한 번 실행 상한(묶음 1건 × 2번): 주요 내용 없는 공시를 최근부터. 원문이 없는 공시는 Gemini를 부르지 않고 까닭만 남긴다
		var first = job(dart, writer, props("dart", 1, 2, 10)).runOnce();
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(dart.calls).containsExactly("20250101000003", "20250101000002");
		assertThat(writer.calls).hasSize(1);
		PlacementSummaryWriter.Input sent = writer.calls.getFirst().getFirst();
		assertThat(sent.type()).isEqualTo("공급 계약");
		assertThat(sent.text()).hasSize(PlacementSummaries.MAX_SOURCE_CHARS).startsWith("1. 계약상대방");
		// 원문의 상대방 이름·세 글자 이상 상장사 이름은 막을 이름으로 넘긴다(보내지는 않는다)
		assertThat(sent.names()).contains("누리소재", "가람전자").doesNotContain("누리");
		assertThat(rows()).containsOnlyKeys("20250101000002", "20250101000003");
		assertThat(rows().get("20250101000003")).containsEntry("summary", OK).containsEntry("version", PlacementSummaries.VERSION).containsEntry("model", "test-model")
			.containsEntry("hidden", false);
		assertThat(rows().get("20250101000002")).containsEntry("summary", null).containsEntry("reason", "NO_TEXT");
		assertThat(usage.used(PlacementSummaryJob.JOB)).isEqualTo(1);

		// 다음 실행: 남은 유상증자 공시. 검사에 걸린 요약은 까닭을 붙여 한 번 다시 쓰게 하고, 그래도 걸리면 저장하지 않고 까닭만 남긴다
		var second = job(dart, writer, props("dart", 1, 2, 10)).runOnce();
		assertThat(second.calls()).isEqualTo(2);
		assertThat(writer.retried).hasSize(1);
		assertThat(writer.retried.getFirst().getFirst().problem()).contains("12.5%");
		assertThat(second.rejected()).isEqualTo(1);
		assertThat(rows().get("20250101000001")).containsEntry("summary", null).containsEntry("reason", "PERCENT");

		// 같은 입력은 다시 부르지 않는다
		dart.calls.clear();
		var third = job(dart, writer, props("dart", 1, 2, 10)).runOnce();
		assertThat(third.targets()).isZero();
		assertThat(dart.calls).isEmpty();

		// 출제는 요약이 있고 숨기지 않은 것만 읽는다. 운영자가 숨기면 빠지고, 다시 만들지도 덮어쓰지도 않는다
		assertThat(store.summaries(List.of("20250101000001", "20250101000002", "20250101000003"))).containsOnly(Map.entry("20250101000003", OK));
		jdbc.update("UPDATE dart_disclosure_summaries SET hidden = TRUE, version = 'old' WHERE receipt_no = '20250101000003'");
		assertThat(store.summaries(List.of("20250101000003"))).isEmpty();
		assertThat(store.summarizedReceipts()).contains("20250101000003");
		assertThat(store.saveSummaries(List.of(new VirtualSimStore.SummaryRow("20250101000003", "덮어쓴 글", null, "m")))).isZero();
		assertThat(rows().get("20250101000003")).containsEntry("summary", OK);
	}

	@Test
	void 검사에_걸린_요약은_까닭을_붙여_한_번_다시_쓰게_한다() {
		Documents dart = seed();
		Writer writer = new Writer();
		writer.replies.put("20250101000003", "이 회사가 공급 계약을 맺었어요. 계약 수치가 담긴 내용이 공개되었어요.");
		writer.rewrites.put("20250101000003", OK);

		var run = job(dart, writer, props("dart", 5, 2, 10)).runOnce();
		assertThat(run.calls()).isEqualTo(2);
		assertThat(usage.used(PlacementSummaryJob.JOB)).isEqualTo(2); // 다시 쓰기도 하루 상한에 센다
		// 다시 쓰기에는 앞서 쓴 글과 까닭만 보내고, 통과한 공시는 다시 보내지 않는다
		assertThat(writer.retried.getFirst()).extracting(r -> r.input().id()).containsExactly("20250101000003");
		assertThat(writer.retried.getFirst().getFirst().draft()).contains("공개되었어요");
		assertThat(writer.retried.getFirst().getFirst().problem()).contains("핵심 수치");
		assertThat(rows().get("20250101000003")).containsEntry("summary", OK).containsEntry("reason", null);
		// 응답에서 빠진 공시(유상증자)는 저장하지 않아 다음 실행에 다시 한다
		assertThat(rows()).doesNotContainKey("20250101000001");
	}

	@Test
	void 하루_상한에_닿으면_멈추고_다음_날에_이어_간다() {
		Documents dart = seed();
		Writer writer = new Writer();
		writer.replies.put("20250101000003", OK);
		usage.take(PlacementSummaryJob.JOB, 100); // 오늘 이미 한 번 불렀다

		var run = job(dart, writer, props("dart", 1, 5, 1)).runOnce();
		assertThat(run.capped()).isTrue();
		assertThat(run.calls()).isZero();
		assertThat(run.status()).isEqualTo("SKIPPED");
		assertThat(writer.calls).isEmpty();
		// 원문을 받아 둔 묶음도 요약을 저장하지 않아 다음 날 다시 받는다
		assertThat(rows()).doesNotContainKey("20250101000003");
		assertThat(runs.findFirstByJobOrderByIdDesc(PlacementSummaryJob.JOB).orElseThrow().getError()).contains("하루 호출 상한 1번");
	}

	@Test
	void 호출이_실패하면_멈추고_저장하지_않아_다음_실행에_다시_한다() {
		Documents dart = seed();
		Writer writer = new Writer();
		writer.fail = new IllegalStateException("Gemini 호출 실패: 429");
		var run = job(dart, writer, props("dart", 2, 3, 10)).runOnce();
		assertThat(run.status()).isEqualTo("FAILED");
		assertThat(run.calls()).isEqualTo(1);
		assertThat(rows()).containsOnlyKeys("20250101000002"); // 원문이 없는 공시만 남는다
		assertThat(runs.findFirstByJobOrderByIdDesc(PlacementSummaryJob.JOB).orElseThrow().getStatus()).isEqualTo("FAILED");

		// OpenDART 키·한도 문제는 그 자리에서 멈춘다(그 공시 탓이 아니라 까닭을 남기지 않는다)
		jdbc.update("DELETE FROM dart_disclosure_summaries");
		dart.fail = new DartDisclosureSource.DartException("020", "요청 제한 초과");
		writer.fail = null;
		int before = dart.calls.size();
		var stopped = job(dart, writer, props("dart", 2, 3, 10)).runOnce();
		assertThat(stopped.status()).isEqualTo("FAILED");
		assertThat(dart.calls).hasSize(before + 1);
		assertThat(rows()).isEmpty();
		assertThat(writer.calls).hasSize(1);
	}
}
