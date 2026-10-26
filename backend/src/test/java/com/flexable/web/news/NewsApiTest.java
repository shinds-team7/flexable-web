package com.flexable.web.news;

import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.header;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.jsonPath;
import static org.springframework.test.web.servlet.result.MockMvcResultMatchers.status;

import java.time.LocalDate;
import java.util.List;

import org.junit.jupiter.api.BeforeEach;
import org.junit.jupiter.api.Test;
import org.springframework.beans.factory.annotation.Autowired;
import org.springframework.boot.test.context.SpringBootTest;
import org.springframework.boot.webmvc.test.autoconfigure.AutoConfigureMockMvc;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.flexable.web.news.NewsDtos.PolicyDraft;

/** api는 승인된 소식만 내보낸다. 여기서는 worker 대신 NewsService로 초안을 넣고, 사람이 검수한 것처럼 DB를 고친다. */
@SpringBootTest(properties = "spring.datasource.url=jdbc:h2:mem:newsapi;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1")
@AutoConfigureMockMvc
class NewsApiTest {

	@Autowired
	MockMvc mvc;

	@Autowired
	NewsService news;

	@Autowired
	JdbcTemplate jdbc;

	private static boolean seeded;

	@BeforeEach
	void seed() {
		if (seeded) {
			return;
		}
		seeded = true;
		LocalDate asOf = LocalDate.of(2026, 10, 21);
		news.saveCollected(draft("seoul-rent", List.of(NewsCategory.HOUSING), 19, 34, false, List.of("서울"), asOf));
		news.saveCollected(draft("all-savings", List.of(NewsCategory.FINANCE, NewsCategory.CULTURE), 19, 34, true, null, asOf));
		news.saveCollected(draft("busan-job", List.of(), null, 39, false, List.of("부산"), asOf));
		news.saveCollected(draft("draft-only", List.of(NewsCategory.CULTURE), 19, 24, true, null, asOf));
		news.saveCollected(draft("no-benefit", List.of(NewsCategory.TAX), 15, 34, true, null, asOf));
		// 사람이 쓰는 항목을 채우고 승인. draft-only는 초안 그대로, no-benefit은 승인됐지만 나에게 얼마가 비어 있다
		jdbc.update("UPDATE youth_news SET review_status = 'APPROVED', benefit = '월 최대 20만 원', action = '서류 준비하기', audience_summary = '소득 기준 있음' "
				+ "WHERE external_id IN ('seoul-rent', 'all-savings', 'busan-job')");
		jdbc.update("UPDATE youth_news SET calc_target = 'POLICY_SAVINGS', slot = 'MAIN' WHERE external_id = 'all-savings'");
		jdbc.update("UPDATE youth_news SET review_status = 'APPROVED', action = '신청하기' WHERE external_id = 'no-benefit'");
	}

	private static PolicyDraft draft(String id, List<NewsCategory> c, Integer min, Integer max, boolean nationwide, List<String> regions, LocalDate asOf) {
		return new PolicyDraft("FAKE", id, "{\"id\":\"" + id + "\"}", id + " 제목", c, min, max, Boolean.TRUE, nationwide, regions,
				LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 30), false, "○○기관(예시)", "https://example.com/" + id, asOf, null, List.of("키워드"), null);
	}

	@Test
	void 로그인_없이_승인된_소식만_카드_필드로_내려준다() throws Exception {
		mvc.perform(get("/api/v1/youth-news"))
			.andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "max-age=300, public"))
			.andExpect(jsonPath("$.items", hasSize(3)))
			.andExpect(jsonPath("$.preview", is(false)))
			.andExpect(jsonPath("$.items[0].category", is("HOUSING")))
			.andExpect(jsonPath("$.items[1].category", is("FINANCE")))
			.andExpect(jsonPath("$.items[1].categories", contains("FINANCE", "CULTURE")))
			.andExpect(jsonPath("$.items[2].categories", contains("ETC")))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("seoul-rent 제목", "all-savings 제목", "busan-job 제목")))
			.andExpect(jsonPath("$.items[0].benefit", is("월 최대 20만 원")))
			.andExpect(jsonPath("$.items[0].action", is("서류 준비하기")))
			.andExpect(jsonPath("$.items[0].audience.summary", is("소득 기준 있음")))
			.andExpect(jsonPath("$.items[0].audience.ageMin", is(19)))
			.andExpect(jsonPath("$.items[0].audience.incomeLimit", is(true)))
			.andExpect(jsonPath("$.items[0].regions[0]", is("서울")))
			.andExpect(jsonPath("$.items[0].applyDeadline", is("2026-11-30")))
			.andExpect(jsonPath("$.items[0].source.org", is("○○기관(예시)")))
			.andExpect(jsonPath("$.items[0].source.url", is("https://example.com/seoul-rent")))
			.andExpect(jsonPath("$.items[0].source.asOf", is("2026-10-21")))
			.andExpect(jsonPath("$.items[0].calcLink", nullValue()))
			.andExpect(jsonPath("$.items[1].regions", is("NATIONWIDE")))
			.andExpect(jsonPath("$.items[1].slot", is("MAIN")))
			.andExpect(jsonPath("$.items[1].calcLink.to", is("/savings?policy=1")))
			.andExpect(jsonPath("$.items[2].audience.ageMin", nullValue()));
	}

	@Test
	void 나이_지역_분야로_거른다() throws Exception {
		// 만 37세: 나이 상한 34인 소식은 빠지고, 하한을 모르는 부산 일자리만
		mvc.perform(get("/api/v1/youth-news").param("age", "37"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("busan-job 제목")));
		// 서울: 서울 소식 + 전국 소식
		mvc.perform(get("/api/v1/youth-news").param("region", "서울"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("seoul-rent 제목", "all-savings 제목")));
		// 여러 분야에 드는 소식은 어느 분야로 골라도 보인다. 분야가 없던 소식은 기타
		mvc.perform(get("/api/v1/youth-news").param("category", "FINANCE"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("all-savings 제목")));
		mvc.perform(get("/api/v1/youth-news").param("category", "CULTURE"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("all-savings 제목")));
		mvc.perform(get("/api/v1/youth-news").param("category", "ETC"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("busan-job 제목")));
		mvc.perform(get("/api/v1/youth-news").param("category", "NOPE")).andExpect(status().isBadRequest());
	}
}
