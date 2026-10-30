package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyInt;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.ArgumentMatchers.anyString;
import static org.mockito.Mockito.mock;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

import java.time.Clock;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.Random;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.MethodOrderer;
import org.junit.jupiter.api.Order;
import org.junit.jupiter.api.Test;
import org.junit.jupiter.api.TestMethodOrder;
import org.mockito.ArgumentCaptor;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.dao.DataAccessResourceFailureException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.flexable.web.ingest.fake.FakeEventOverviewWriter;
import com.flexable.web.market.DailyClose;
import com.flexable.web.market.EventDtos.EventDetail;
import com.flexable.web.market.EventDtos.EventView;
import com.flexable.web.market.EventDtos.EvidenceRow;
import com.flexable.web.market.EventDtos.OverviewResult;
import com.flexable.web.market.EventDtos.OverviewTarget;
import com.flexable.web.market.EventService;
import com.flexable.web.market.MarketService;

/**
 * 사건 AI 개요 단계(decisions/2026-10-29-event-ai-summary). 작성기를 바꿔 끼워 키 없음·호출 실패·검사 탈락·입력 바뀜을 본다(외부 호출 없음).
 * 사건은 MarketEventJobTest처럼 고정 난수 시계열에 하루 +20%를 넣어 만든다.
 */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:overview;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
@TestMethodOrder(MethodOrderer.OrderAnnotation.class) // 실패 시험은 아직 개요를 만들지 않은 사건이 있어야 한다
class EventOverviewJobTest {

	@Autowired
	MarketSyncJob sync;

	@Autowired
	EventOverviewJob job;

	@Autowired
	MarketService market;

	@Autowired
	EventService events;

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

	@MockitoBean
	EventOverviewWriter writer;

	private static long eventId;

	@BeforeEach
	void seed() {
		reset(writer);
		if (eventId != 0) {
			return;
		}
		sync.runOnce(); // 작성기가 꺼져 있어(목 기본값) 개요 단계는 건너뛴다
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
		events.detect("069500");
		events.detect("005930");
		EventView e = events.events("005930").stream().filter(x -> x.startDate().equals(dates.get(jump))).findFirst().orElseThrow();
		eventId = e.id();
		events.saveEvidence(eventId, "DART", List.of(new EvidenceRow("DART", "20990101000001", "단일판매ㆍ공급계약체결", "삼성전자",
				dates.get(jump), "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20990101000001", 3)));
	}

	private EventDetail detail() {
		return events.detail(eventId).orElseThrow();
	}

	@Test
	@Order(1)
	void 키가_없거나_호출이_실패하면_개요_없이_사실_문장만_나간다() {
		when(writer.enabled()).thenReturn(false);
		assertThat(job.runOnce(true).status()).isEqualTo("SKIPPED");
		verify(writer, never()).write(anyList());
		assertThat(detail().aiSummary()).isNull();
		assertThat(detail().whatHappened()).contains("삼성전자 주가가");

		when(writer.enabled()).thenReturn(true);
		when(writer.write(anyList())).thenThrow(new IllegalStateException("Gemini 호출 실패: 429"));
		EventOverviewJob.Run failed = job.runOnce(true);
		assertThat(failed.status()).isEqualTo("FAILED");
		assertThat(failed.calls()).isEqualTo(1); // 첫 호출이 실패하면 멈춘다
		assertThat(detail().aiSummary()).isNull();
		assertThat(detail().aiGenerated()).isFalse();
	}

	@Test
	@Order(2)
	void 검사_탈락은_저장하지_않고_입력이_바뀐_사건만_다시_만든다() {
		when(writer.enabled()).thenReturn(true);
		// 이 사건만 검사 탈락(null), 나머지는 통과한 문장
		when(writer.write(anyList())).thenAnswer(inv -> {
			List<OverviewTarget> batch = inv.getArgument(0);
			return batch.stream()
				.map(t -> new OverviewResult(t.input().id(), t.inputHash(), t.input().id() == eventId ? null : t.input().name() + " 주가가 움직였어요.",
						"test-model", false))
				.toList();
		});
		EventOverviewJob.Run first = job.runOnce(true);
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(first.rejected()).isEqualTo(1);
		assertThat(detail().aiSummary()).isNull();

		// 같은 입력이면 다시 부르지 않는다(검사 탈락도 지문을 남긴다)
		clearInvocations(writer);
		EventOverviewJob.Run again = job.runOnce(true);
		assertThat(again.targets()).isZero();
		verify(writer, never()).write(anyList());

		// 공시 근거가 바뀐 사건만 다시 만든다
		clearInvocations(writer);
		when(writer.write(anyList())).thenAnswer(inv -> {
			List<OverviewTarget> batch = inv.getArgument(0);
			return batch.stream()
				.map(t -> new OverviewResult(t.input().id(), t.inputHash(), "삼성전자 주가는 하루에 크게 올랐어요.", "test-model", false))
				.toList();
		});
		EventDetail d = detail();
		events.saveEvidence(eventId, "DART", List.of(new EvidenceRow("DART", "20990101000002", "주요사항보고서(유상증자결정)", "삼성전자",
				d.startDate(), "https://dart.fss.or.kr/dsaf001/main.do?rcpNo=20990101000002", 3)));
		@SuppressWarnings("unchecked")
		ArgumentCaptor<List<OverviewTarget>> sent = ArgumentCaptor.forClass(List.class);
		EventOverviewJob.Run changed = job.runOnce(true);
		verify(writer, times(1)).write(sent.capture());
		assertThat(changed.targets()).isEqualTo(1);
		assertThat(sent.getValue()).singleElement().satisfies(t -> {
			assertThat(t.input().id()).isEqualTo(eventId);
			assertThat(t.input().disclosures()).containsExactly("주요사항보고서(유상증자결정)");
		});
		assertThat(detail().aiSummary()).isNotNull();
		assertThat(detail().aiSummary().text()).isEqualTo("삼성전자 주가는 하루에 크게 올랐어요.");
		assertThat(detail().aiSummary().isSample()).isFalse();
		assertThat(detail().aiGenerated()).isFalse();
	}

	@Test
	@Order(3)
	void 화면_3년_밖의_사건은_만들지_않고_하루_상한에_닿으면_다시_켜도_멈춘다() {
		// SK하이닉스: 4년 전 한 번, 최근 두 번 하루 +20% 사건을 만든다(시장 대용 종목은 seed에서 저장함)
		List<LocalDate> dates = market.dailyCloses("005930", LocalDate.of(2000, 1, 1)).stream().map(DailyClose::date).toList();
		LocalDate fourYearsAgo = dates.getLast().minusYears(4);
		int old = dates.indexOf(dates.stream().filter(d -> !d.isBefore(fourYearsAgo)).findFirst().orElseThrow());
		int recent = dates.size() - 50;
		int earlier = dates.size() - 150;
		Random rnd = new Random(7);
		List<DailyClose> closes = new ArrayList<>();
		double s = Math.log(100_000);
		for (int i = 0; i < dates.size(); i++) {
			if (i > 0) {
				s += rnd.nextGaussian() * 0.004 + (i == old || i == recent || i == earlier ? Math.log(1.2) : 0);
			}
			closes.add(new DailyClose(dates.get(i), Math.round(Math.exp(s))));
		}
		market.saveDailyCloses("000660", closes, Map.of(), "테스트");
		events.detect("000660");
		long oldId = events.events("000660").stream().filter(x -> x.startDate().equals(dates.get(old))).findFirst().orElseThrow().id();
		long recentId = events.events("000660").stream().filter(x -> x.startDate().equals(dates.get(recent))).findFirst().orElseThrow().id();

		List<Long> targetIds = events.overviewTargets(10_000, false).stream().map(t -> t.input().id()).toList();
		assertThat(targetIds).contains(recentId).doesNotContain(oldId).hasSizeGreaterThan(1); // 상한 시험에 두 건 이상 필요

		// 오늘 이미 쓴 수 + 1번만 남긴 하루 상한, 한 번 호출에 1건
		when(writer.enabled()).thenReturn(true);
		when(writer.write(anyList())).thenAnswer(inv -> {
			List<OverviewTarget> batch = inv.getArgument(0);
			return batch.stream().map(t -> new OverviewResult(t.input().id(), t.inputHash(), null, "test-model", false)).toList();
		});
		int cap = usage.used(EventOverviewJob.JOB) + 1;
		IngestProperties.EventOverview o = props.eventOverview();
		IngestProperties capped = new IngestProperties(props.priceSource(), props.instrumentSource(), props.instrumentFallback(),
				props.backfillYears(), props.recheckDays(), props.runOnStart(), props.kiwoom(), props.krx(), props.disclosureSource(), props.dart(),
				props.youth(), props.gemini(), new IngestProperties.EventOverview(o.source(), o.apiKey(), o.model(), 1, 100, cap));

		EventOverviewJob.Run first = new EventOverviewJob(events, writer, usage, capped, runs, clock).runOnce(false);
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(first.calls()).isEqualTo(1);
		assertThat(first.capped()).isTrue();
		verify(writer, times(1)).write(anyList());
		assertThat(runs.findFirstByJobOrderByIdDesc(EventOverviewJob.JOB).orElseThrow().getError()).contains("하루 호출 상한");

		// worker를 다시 켠 것과 같다(새 인스턴스): 같은 날이면 부르지 않는다
		clearInvocations(writer);
		EventOverviewJob.Run restarted = new EventOverviewJob(events, writer, usage, capped, runs, clock).runOnce(false);
		assertThat(restarted.status()).isEqualTo("SKIPPED");
		assertThat(restarted.calls()).isZero();
		assertThat(restarted.capped()).isTrue();
		verify(writer, never()).write(anyList());
		assertThat(usage.used(EventOverviewJob.JOB)).isEqualTo(cap);
	}
	@Test
	@Order(4)
	void 마지막_거래일이_오래된_종목은_그_종목의_3년_기준으로_고른다() {
		// NAVER: 시세가 60거래일 전에 끊긴 종목. 화면 3년 차트는 그 마지막 거래일에서 3년을 거슬러 가므로, 오늘 기준 3년 밖이어도 핀으로 보인다
		List<LocalDate> dates = market.dailyCloses("005930", LocalDate.of(2000, 1, 1)).stream().map(DailyClose::date).toList();
		int staleEnd = dates.size() - 1 - 60;
		LocalDate staleAsOf = dates.get(staleEnd);
		LocalDate screenFrom = staleAsOf.minusMonths(36); // MarketInsightService.range와 같은 기준
		int shown = indexOnOrAfter(dates, screenFrom.plusDays(10)); // 화면 안, 오늘 기준 3년(+14일 여유)보다는 앞
		int hidden = indexOnOrAfter(dates, screenFrom.minusDays(40)); // 화면 밖
		assertThat(dates.get(shown)).isBefore(LocalDate.now(clock.withZone(IngestConfig.SEOUL)).minusMonths(36).minusDays(14));
		Random rnd = new Random(5);
		List<DailyClose> closes = new ArrayList<>();
		double s = Math.log(200_000);
		for (int i = 0; i <= staleEnd; i++) {
			if (i > 0) {
				s += rnd.nextGaussian() * 0.004 + (i == shown || i == hidden ? Math.log(1.2) : 0);
			}
			closes.add(new DailyClose(dates.get(i), Math.round(Math.exp(s))));
		}
		market.saveDailyCloses("035420", closes, Map.of(), "테스트");
		jdbc.update("DELETE FROM daily_prices WHERE instrument_id = (SELECT id FROM instruments WHERE code = ?) AND trade_date > ?", "035420", staleAsOf);
		events.detect("035420");
		long shownId = events.events("035420").stream().filter(x -> x.startDate().equals(dates.get(shown))).findFirst().orElseThrow().id();
		long hiddenId = events.events("035420").stream().filter(x -> x.startDate().equals(dates.get(hidden))).findFirst().orElseThrow().id();

		List<Long> targetIds = events.overviewTargets(10_000, false).stream().map(t -> t.input().id()).toList();
		assertThat(targetIds).contains(shownId).doesNotContain(hiddenId);
	}

	@Test
	@Order(5)
	void 하루_호출_수를_세다_DB_오류가_나도_실행_기록을_닫는다() {
		when(writer.enabled()).thenReturn(true);
		GeminiDailyUsage broken = mock(GeminiDailyUsage.class);
		when(broken.take(anyString(), anyInt())).thenThrow(new DataAccessResourceFailureException("DB 연결 끊김"));

		EventOverviewJob.Run run = new EventOverviewJob(events, writer, broken, props, runs, clock).runOnce(false);
		assertThat(run.status()).isEqualTo("FAILED");
		assertThat(run.calls()).isZero();
		assertThat(run.error()).contains("DB 연결 끊김");
		verify(writer, never()).write(anyList());
		IngestRun row = runs.findFirstByJobOrderByIdDesc(EventOverviewJob.JOB).orElseThrow();
		assertThat(row.getStatus()).isEqualTo("FAILED"); // RUNNING으로 남지 않는다
		assertThat(row.getFinishedAt()).isNotNull();
		assertThat(row.getError()).contains("DB 연결 끊김");
	}

	@Test
	@Order(6)
	void 예시_작성기는_Gemini_하루_호출_수에_세지_않는다() {
		// 오늘 센 수 그대로를 하루 상한으로 둔다: Gemini라면 한 번도 못 부르는 상태
		int before = usage.used(EventOverviewJob.JOB);
		IngestProperties.EventOverview o = props.eventOverview();
		IngestProperties capped = new IngestProperties(props.priceSource(), props.instrumentSource(), props.instrumentFallback(),
				props.backfillYears(), props.recheckDays(), props.runOnStart(), props.kiwoom(), props.krx(), props.disclosureSource(), props.dart(),
				props.youth(), props.gemini(), new IngestProperties.EventOverview(o.source(), o.apiKey(), o.model(), 10, 100, before));

		EventOverviewJob.Run run = new EventOverviewJob(events, new FakeEventOverviewWriter(), usage, capped, runs, clock).runOnce(false);
		assertThat(run.status()).isEqualTo("SUCCESS");
		assertThat(run.capped()).isFalse();
		assertThat(run.calls()).isPositive();
		assertThat(run.saved()).isPositive();
		assertThat(usage.used(EventOverviewJob.JOB)).isEqualTo(before);
	}

	/** on(포함) 이후 첫 거래일의 위치 */
	private static int indexOnOrAfter(List<LocalDate> dates, LocalDate on) {
		return dates.indexOf(dates.stream().filter(d -> !d.isBefore(on)).findFirst().orElseThrow());
	}
}
