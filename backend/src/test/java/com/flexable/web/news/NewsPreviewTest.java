package com.flexable.web.news;

import static org.assertj.core.api.Assertions.assertThat;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.jdbc.core.JdbcTemplate;

import com.flexable.web.news.NewsDtos.NewsFeed;
import com.flexable.web.news.NewsDtos.NewsItem;
import com.flexable.web.news.NewsDtos.PolicyDraft;

/** local 프로필의 미리보기(app.news.preview-drafts=true): 검수 전 초안도 보이고, 사람이 쓸 항목은 미리보기 문구로 채운다. 반려는 빠진다. */
@SpringBootTest(webEnvironment = SpringBootTest.WebEnvironment.NONE, properties = {
		"spring.datasource.url=jdbc:h2:mem:newspreview;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "app.news.preview-drafts=true" })
class NewsPreviewTest {

	@Autowired
	NewsService news;

	@Autowired
	JdbcTemplate jdbc;

	@Test
	void 초안을_미리보기_문구와_함께_보여준다() {
		news.saveCollected(draft("d-1"));
		news.saveCollected(draft("d-2"));
		jdbc.update("UPDATE youth_news SET review_status = 'REJECTED' WHERE external_id = 'd-2'");
		// 신청 날짜가 없고 사업기간이 끝난 소식은 마감으로 보고 뺀다. 사업기간이 남았으면 그대로(마감일 미정)
		news.saveCollected(draft("ended", LocalDate.of(2020, 12, 31)));
		news.saveCollected(draft("running", LocalDate.of(2099, 12, 31)));

		NewsFeed feed = news.list(null, null, null);
		assertThat(feed.preview()).isTrue();
		assertThat(feed.items()).extracting(NewsItem::title).containsExactly("d-1", "running");
		NewsItem n = feed.items().getFirst();
		assertThat(n.benefit()).isEqualTo(NewsService.PREVIEW_BENEFIT);
		assertThat(n.action()).isEqualTo(NewsService.PREVIEW_ACTION);
		assertThat(n.audience().summary()).isEqualTo(NewsService.PREVIEW_SUMMARY);
		assertThat(n.categories()).containsExactly(NewsCategory.ETC);
	}

	private static PolicyDraft draft(String id) {
		return draft(id, null);
	}

	private static PolicyDraft draft(String id, LocalDate bizEnd) {
		return new PolicyDraft("FAKE", id, "{\"id\":\"" + id + "\"}", id, List.of(), null, null, null, true, null, null, null, false, "○○기관(예시)",
				"https://example.com/" + id, LocalDate.of(2026, 10, 21), null, List.of(), bizEnd);
	}
}
