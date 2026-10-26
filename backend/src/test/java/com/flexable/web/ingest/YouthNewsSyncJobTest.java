package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.context.ActiveProfiles;

import com.flexable.web.news.NewsDtos.SaveOutcome;

/** worker 프로필 + 가짜 정책으로 수집을 돌린다(외부 호출 없음). */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = "spring.datasource.url=jdbc:h2:mem:youth;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@ActiveProfiles("worker")
class YouthNewsSyncJobTest {

	@Autowired
	YouthNewsSyncJob job;

	@Autowired
	IngestRunRepository runs;

	@Autowired
	JdbcTemplate jdbc;

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
}
