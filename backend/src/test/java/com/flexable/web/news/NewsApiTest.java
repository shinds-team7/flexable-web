package com.flexable.web.news;

import static org.assertj.core.api.Assertions.assertThat;
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
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;

/**
 * api는 수집한 소식을 검수 없이 내보낸다(2026-10-26 결정). 반려(REJECTED)한 것과 지역을 확인 못 한 것만 뺀다.
 * 여기서는 worker 대신 NewsService로 카드를 넣고, 요약도 worker처럼 summaryTargets → applySummaries로 넣는다.
 */
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
		news.saveCollected(draft("culture-pass", List.of(NewsCategory.CULTURE), 19, 24, true, null, asOf));
		news.saveCollected(draft("rejected", List.of(NewsCategory.TAX), 15, 34, true, null, asOf));
		news.saveCollected(draft("no-region", List.of(NewsCategory.JOB), 19, 34, false, null, asOf));
		jdbc.update("UPDATE youth_news SET review_status = 'REJECTED' WHERE external_id = 'rejected'");
		jdbc.update("UPDATE youth_news SET calc_target = 'POLICY_SAVINGS', slot = 'MAIN' WHERE external_id = 'all-savings'");
		// 요약: 서울 월세만 요약이 붙고, 부산 일자리는 검사에서 버린 결과(null)가 들어간다
		List<SummaryTarget> targets = news.summaryTargets(100);
		SummaryTarget rent = targets.stream().filter(t -> t.title().equals("seoul-rent 제목")).findFirst().orElseThrow();
		SummaryTarget job = targets.stream().filter(t -> t.title().equals("busan-job 제목")).findFirst().orElseThrow();
		news.applySummaries(List.of(new SummaryResult(rent.id(), rent.contentHash(), "서울에 사는 청년에게 월세를 월 최대 20만 원 지원해요."),
				new SummaryResult(job.id(), job.contentHash(), null)));
	}

	private static PolicyDraft draft(String id, List<NewsCategory> c, Integer min, Integer max, boolean nationwide, List<String> regions, LocalDate asOf) {
		return new PolicyDraft("FAKE", id, "{\"id\":\"" + id + "\"}", id + " 제목", c, min, max, Boolean.TRUE, nationwide, regions,
				LocalDate.of(2026, 10, 1), LocalDate.of(2026, 11, 30), false, "○○기관(예시)", "https://example.com/" + id, asOf, null, List.of("키워드"), null);
	}

	@Test
	void 로그인_없이_검수_없이_카드_필드로_내려준다() throws Exception {
		mvc.perform(get("/api/v1/youth-news"))
			.andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "max-age=300, public"))
			// 반려한 것과 지역을 확인 못 한 것은 빠진다
			.andExpect(jsonPath("$.items", hasSize(4)))
			.andExpect(jsonPath("$.items[*].title", contains("seoul-rent 제목", "all-savings 제목", "busan-job 제목", "culture-pass 제목")))
			.andExpect(jsonPath("$.preview").doesNotExist())
			.andExpect(jsonPath("$.items[0].category", is("HOUSING")))
			.andExpect(jsonPath("$.items[0].summary", is("서울에 사는 청년에게 월세를 월 최대 20만 원 지원해요.")))
			// 사람이 쓰던 항목은 비어 있다
			.andExpect(jsonPath("$.items[0].benefit", nullValue()))
			.andExpect(jsonPath("$.items[0].action", nullValue()))
			.andExpect(jsonPath("$.items[0].audience.summary", nullValue()))
			.andExpect(jsonPath("$.items[0].audience.ageMin", is(19)))
			.andExpect(jsonPath("$.items[0].audience.incomeLimit", is(true)))
			.andExpect(jsonPath("$.items[0].regions[0]", is("서울")))
			.andExpect(jsonPath("$.items[0].applyDeadline", is("2026-11-30")))
			.andExpect(jsonPath("$.items[0].source.org", is("○○기관(예시)")))
			.andExpect(jsonPath("$.items[0].source.url", is("https://example.com/seoul-rent")))
			.andExpect(jsonPath("$.items[0].source.asOf", is("2026-10-21")))
			.andExpect(jsonPath("$.items[0].calcLink", nullValue()))
			.andExpect(jsonPath("$.items[1].category", is("FINANCE")))
			.andExpect(jsonPath("$.items[1].categories", contains("FINANCE", "CULTURE")))
			.andExpect(jsonPath("$.items[1].regions", is("NATIONWIDE")))
			.andExpect(jsonPath("$.items[1].slot", is("MAIN")))
			.andExpect(jsonPath("$.items[1].calcLink.to", is("/savings?policy=1")))
			.andExpect(jsonPath("$.items[1].summary", nullValue()))
			// 검사에서 버린 요약은 null로 나간다
			.andExpect(jsonPath("$.items[2].summary", nullValue()))
			.andExpect(jsonPath("$.items[2].categories", contains("ETC")))
			.andExpect(jsonPath("$.items[2].audience.ageMin", nullValue()));
	}

	@Test
	void 나이_지역_분야로_거른다() throws Exception {
		// 만 37세: 나이 상한 34·24인 소식은 빠지고, 하한을 모르는 부산 일자리만
		mvc.perform(get("/api/v1/youth-news").param("age", "37"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("busan-job 제목")));
		// 서울: 서울 소식 + 전국 소식
		mvc.perform(get("/api/v1/youth-news").param("region", "서울"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("seoul-rent 제목", "all-savings 제목", "culture-pass 제목")));
		// 여러 분야에 드는 소식은 어느 분야로 골라도 보인다. 분야가 없던 소식은 기타
		mvc.perform(get("/api/v1/youth-news").param("category", "FINANCE"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("all-savings 제목")));
		mvc.perform(get("/api/v1/youth-news").param("category", "CULTURE"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("all-savings 제목", "culture-pass 제목")));
		mvc.perform(get("/api/v1/youth-news").param("category", "ETC"))
			.andExpect(jsonPath("$.items[*].title", containsInAnyOrder("busan-job 제목")));
		mvc.perform(get("/api/v1/youth-news").param("category", "NOPE")).andExpect(status().isBadRequest());
	}

	@Test
	void 요약은_안_한_것과_원문이_바뀐_것만_다시_한다() {
		// 서울 월세(요약함)·부산 일자리(검사 탈락도 한 번 본 것)는 대상이 아니다. 반려·지역 없음도 빠진다
		assertThat(news.summaryTargets(100)).extracting(SummaryTarget::title).containsExactly("all-savings 제목", "culture-pass 제목");
		assertThat(news.summaryTargets(1)).hasSize(1);
		// 원문이 바뀌면 다시 대상이 되고, 그사이 원문이 또 바뀌면 옛 요약은 넣지 않는다
		jdbc.update("UPDATE youth_news_raw SET content_hash = 'changed' WHERE external_id = 'seoul-rent'");
		SummaryTarget rent = news.summaryTargets(100).stream().filter(t -> t.title().equals("seoul-rent 제목")).findFirst().orElseThrow();
		assertThat(rent.contentHash()).isEqualTo("changed");
		assertThat(news.applySummaries(List.of(new SummaryResult(rent.id(), "older", "옛 원문 요약")))).isZero();
		jdbc.update("UPDATE youth_news_raw SET content_hash = (SELECT summary_hash FROM youth_news WHERE external_id = 'seoul-rent') WHERE external_id = 'seoul-rent'");
	}
}
