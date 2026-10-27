package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.mockito.ArgumentMatchers.anyList;
import static org.mockito.Mockito.reset;
import static org.mockito.Mockito.when;

import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;
import org.springframework.test.context.bean.override.mockito.MockitoBean;

import com.flexable.web.news.NewsDtos.SaveOutcome;
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;

/** worker 프로필 + 가짜 정책으로 수집을 돌린다(외부 호출 없음). 요약기(Gemini)는 바꿔 끼운다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:youth;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class YouthNewsSyncJobTest {

	@Autowired
	YouthNewsSyncJob job;

	@Autowired
	IngestRunRepository runs;

	@Autowired
	JdbcTemplate jdbc;

	@MockitoBean
	NewsSummarizer summarizer;

	@BeforeEach
	void clean() {
		reset(summarizer);
		jdbc.update("DELETE FROM youth_news");
		jdbc.update("DELETE FROM youth_news_raw");
	}

	@Test
	void 초안으로_저장하고_다시_돌리면_바뀐_것만_갱신한다() {
		YouthNewsSyncJob.Result first = job.runOnce();
		assertThat(first.status()).isEqualTo("SUCCESS");
		assertThat(first.counts()).containsEntry(SaveOutcome.CREATED, 3);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM youth_news WHERE review_status = 'DRAFT'", Integer.class)).isEqualTo(3);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM youth_news_raw", Integer.class)).isEqualTo(3);
		assertThat(runs.findFirstByJobOrderByIdDesc(YouthNewsSyncJob.JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");

		// 원문이 그대로면 아무것도 바꾸지 않는다
		YouthNewsSyncJob.Result again = job.runOnce();
		assertThat(again.counts()).containsEntry(SaveOutcome.UNCHANGED, 3);

		// 원문이 그대로여도 초안의 변환 결과가 다르면(변환 규칙이 바뀐 경우) 다시 채운다
		jdbc.update("UPDATE youth_news SET categories = 'ETC' WHERE external_id = 'fake-2'");
		YouthNewsSyncJob.Result remap = job.runOnce();
		assertThat(remap.counts()).containsEntry(SaveOutcome.UPDATED, 1).containsEntry(SaveOutcome.UNCHANGED, 2);
		assertThat(jdbc.queryForObject("SELECT categories FROM youth_news WHERE external_id = 'fake-2'", String.class)).isEqualTo("JOB");

		// 승인된 소식은 원문이 바뀌어도 사람이 쓴 내용을 덮어쓰지 않는다
		jdbc.update("UPDATE youth_news SET review_status = 'APPROVED', title = '사람이 고친 제목' WHERE external_id = 'fake-1'");
		jdbc.update("UPDATE youth_news_raw SET content_hash = 'old'");
		YouthNewsSyncJob.Result changed = job.runOnce();
		assertThat(changed.counts()).containsEntry(SaveOutcome.KEPT, 1).containsEntry(SaveOutcome.UPDATED, 2);
		assertThat(jdbc.queryForObject("SELECT title FROM youth_news WHERE external_id = 'fake-1'", String.class)).isEqualTo("사람이 고친 제목");
	}

	@Test
	void 수집_뒤에_요약하지_않은_카드만_묶어서_요약한다() {
		when(summarizer.enabled()).thenReturn(true);
		when(summarizer.summarize(anyList())).thenAnswer(inv -> {
			List<SummaryTarget> batch = inv.getArgument(0);
			return batch.stream().map(t -> new SummaryResult(t.id(), t.contentHash(), t.title() + " 요약이에요.")).toList();
		});
		job.runOnce();
		YouthNewsSyncJob.SummaryRun first = job.summarize();
		// runOnce 안에서 이미 요약했으므로 두 번째 summarize는 대상이 없다
		assertThat(first.targets()).isZero();
		assertThat(first.calls()).isZero();
		Integer summarized = jdbc.queryForObject("SELECT COUNT(*) FROM youth_news WHERE summary IS NOT NULL", Integer.class);
		assertThat(summarized).isPositive();
		assertThat(jdbc.queryForObject("SELECT summary FROM youth_news WHERE external_id = 'fake-2'", String.class))
			.isEqualTo("구직 청년 면접 정장 대여(예시) 요약이에요.");
		assertThat(runs.findFirstByJobOrderByIdDesc(YouthNewsSyncJob.SUMMARY_JOB).orElseThrow().getStatus()).isEqualTo("SUCCESS");

		// 원문이 바뀐 카드만 다시 요약한다. 호출이 실패하면 멈추고 기존 요약은 그대로 둔다
		jdbc.update("UPDATE youth_news SET summary_hash = 'old' WHERE external_id = 'fake-2'");
		when(summarizer.summarize(anyList())).thenThrow(new IllegalStateException("Gemini 호출 실패: 429"));
		YouthNewsSyncJob.SummaryRun failed = job.summarize();
		assertThat(failed.targets()).isEqualTo(1);
		assertThat(failed.status()).isEqualTo("FAILED");
		assertThat(jdbc.queryForObject("SELECT summary FROM youth_news WHERE external_id = 'fake-2'", String.class))
			.isEqualTo("구직 청년 면접 정장 대여(예시) 요약이에요.");
	}

	@Test
	void 키가_없으면_요약_없이_넘어간다() {
		when(summarizer.enabled()).thenReturn(false);
		assertThat(job.runOnce().status()).isEqualTo("SUCCESS");
		assertThat(job.summarize().status()).isEqualTo("SKIPPED");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM youth_news WHERE summary IS NOT NULL", Integer.class)).isZero();
	}
}
