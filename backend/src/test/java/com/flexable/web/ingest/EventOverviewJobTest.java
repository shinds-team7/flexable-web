package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.clearInvocations;
import static org.mockito.Mockito.never;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.times;
import static org.mockito.Mockito.verify;
import static org.mockito.Mockito.when;

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
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

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
}
