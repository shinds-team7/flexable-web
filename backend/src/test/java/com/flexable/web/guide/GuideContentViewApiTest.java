package com.flexable.web.guide;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.everyItem;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.Set;
import java.util.regex.Pattern;
import java.util.stream.Collectors;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

/** 금융 가이드 글별 조회수(2026-11-10 결정): 0에서 시작, 방문자·글·날짜당 한 번, 로그인 없이 동작 */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:guideviews;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class GuideContentViewApiTest {

	private static final String VIEWER_A = "11111111-1111-4111-8111-111111111111";
	private static final String VIEWER_B = "22222222-2222-4222-8222-222222222222";
	private static final String RATE_VIEWS = "$.items[?(@.id=='interest-rate')].views";

	@Autowired
	MockMvc mvc;

	@Autowired
	JdbcTemplate jdbc;

	@Autowired
	GuideContentViewService views;

	@BeforeEach
	void reset() {
		jdbc.update("delete from guide_content_view_log");
		jdbc.update("update guide_content_views set view_count = 0");
	}

	private void view(String id, String body, int expected) throws Exception {
		mvc.perform(post("/api/v1/guide-contents/" + id + "/views").contentType(MediaType.APPLICATION_JSON).content(body))
			.andExpect(status().is(expected));
	}

	private static String viewer(String id) {
		return "{\"viewerId\":\"" + id + "\"}";
	}

	@Test
	void everyArticleStartsAtZero() throws Exception {
		mvc.perform(get("/api/v1/guide-contents/views"))
			.andExpect(status().isOk())
			.andExpect(jsonPath("$.items", hasSize(18)))
			.andExpect(jsonPath("$.items[*].views", everyItem(is(0))));
	}

	@Test
	void countsOncePerViewerPerDayAndSeparatelyForOtherViewers() throws Exception {
		view("interest-rate", viewer(VIEWER_A), 204);
		view("interest-rate", viewer(VIEWER_A), 204);
		view("interest-rate", viewer(VIEWER_A.toUpperCase()), 204);
		mvc.perform(get("/api/v1/guide-contents/views")).andExpect(jsonPath(RATE_VIEWS, contains(1)));

		view("interest-rate", viewer(VIEWER_B), 204);
		mvc.perform(get("/api/v1/guide-contents/views")).andExpect(jsonPath(RATE_VIEWS, contains(2)));
	}

	@Test
	void sameViewerCountsAgainOnAnotherDay() throws Exception {
		jdbc.update("insert into guide_content_view_log (content_id, viewer_id, viewed_on) values (?, ?, ?)", "interest-rate", VIEWER_A,
				LocalDate.now().minusDays(2));
		view("interest-rate", viewer(VIEWER_A), 204);
		mvc.perform(get("/api/v1/guide-contents/views")).andExpect(jsonPath(RATE_VIEWS, contains(1)));
	}

	@Test
	void rejectsUnknownArticleAndBadViewer() throws Exception {
		view("no-such-article", viewer(VIEWER_A), 404);
		view("interest-rate", viewer("nope"), 400);
		view("interest-rate", "{}", 400);
		assertThat(jdbc.queryForObject("select count(*) from guide_content_view_log", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("select count(*) from guide_content_views", Integer.class)).isEqualTo(18);
	}

	@Test
	void cleanupRemovesOldViewersButKeepsTotals() throws Exception {
		view("interest-rate", viewer(VIEWER_A), 204);
		jdbc.update("insert into guide_content_view_log (content_id, viewer_id, viewed_on) values (?, ?, ?)", "interest-rate", VIEWER_B,
				LocalDate.now().minusDays(GuideContentViewService.RETENTION_DAYS + 2L));

		assertThat(views.deleteExpired()).isEqualTo(1);

		assertThat(jdbc.queryForObject("select count(*) from guide_content_view_log", Integer.class)).isEqualTo(1);
		mvc.perform(get("/api/v1/guide-contents/views")).andExpect(jsonPath(RATE_VIEWS, contains(1)));
	}

	/** 화면의 글 목록에 글을 더하면 새 마이그레이션으로 합계 표에도 넣어야 한다 */
	@Test
	void seededArticlesMatchFrontendList() throws Exception {
		String source = Files.readString(Path.of("..", "src", "data", "financeGuide.ts"));
		Set<String> frontend = Pattern.compile("\\{ id: '([a-z0-9-]+)', category:").matcher(source).results().map(m -> m.group(1))
			.collect(Collectors.toSet());
		Set<String> seeded = Set.copyOf(jdbc.queryForList("select content_id from guide_content_views", String.class));
		assertThat(seeded).isEqualTo(frontend);
	}
}
