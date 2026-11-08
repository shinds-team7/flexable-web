package com.flexable.web.news;

import static org.assertj.core.api.Assertions.assertThat;
import static org.hamcrest.Matchers.contains;
import static org.hamcrest.Matchers.containsInAnyOrder;
import static org.hamcrest.Matchers.hasSize;
import static org.hamcrest.Matchers.is;
import static org.hamcrest.Matchers.nullValue;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.get;
import static org.springframework.test.web.servlet.request.MockMvcRequestBuilders.post;
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
import org.springframework.http.MediaType;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.test.web.servlet.MockMvc;

import com.flexable.web.news.NewsDtos.PolicyDraft;
import com.flexable.web.news.NewsDtos.SummaryResult;
import com.flexable.web.news.NewsDtos.SummaryTarget;

/**
 * api는 AI 요약을 마친 소식을 검수 없이 내보낸다(2026-11-06 결정). 반려·필수 항목 누락·미요약은 제외한다.
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

	@BeforeEach
	void seed() {
		jdbc.update("DELETE FROM youth_news_view");
		jdbc.update("DELETE FROM youth_news");
		jdbc.update("DELETE FROM youth_news_raw");
		LocalDate asOf = LocalDate.of(2026, 10, 21);
		news.saveCollected(draft("seoul-rent", List.of(NewsCategory.HOUSING), 19, 34, false, List.of("서울"), asOf));
		news.saveCollected(draft("all-savings", List.of(NewsCategory.FINANCE, NewsCategory.CULTURE), 19, 34, true, null, asOf));
		news.saveCollected(draft("busan-job", List.of(), null, 39, false, List.of("부산"), asOf));
		news.saveCollected(draft("culture-pass", List.of(NewsCategory.CULTURE), 19, 24, true, null, asOf));
		news.saveCollected(draft("rejected", List.of(NewsCategory.TAX), 15, 34, true, null, asOf));
		// 마감일이 지난 지 7일이 넘은 소식은 목록에서 빠진다(아래 목록 검증이 4건 그대로인 것으로 확인)
		news.saveCollected(closedLongAgo("closed-old", asOf));
		news.saveCollected(draft("no-region", List.of(NewsCategory.JOB), 19, 34, false, null, asOf));
		jdbc.update("UPDATE youth_news SET review_status = 'REJECTED' WHERE external_id = 'rejected'");
		jdbc.update("UPDATE youth_news SET calc_target = 'POLICY_SAVINGS', slot = 'MAIN' WHERE external_id = 'all-savings'");
		// 필수 요약이 있는 네 카드만 공개한다. 미요약·검사 탈락·공백은 별도 초안으로 보존한다.
		List<SummaryTarget> targets = news.summaryTargets(100);
		SummaryTarget rent = targets.stream().filter(t -> t.title().equals("seoul-rent 제목")).findFirst().orElseThrow();
		news.applySummaries(targets.stream().map(t -> new SummaryResult(t.id(), t.contentHash(),
				t.id() == rent.id() ? "서울에 사는 청년에게 월세를 월 최대 20만 원 지원해요." : t.title() + " 요약")).toList());
		for (String id : List.of("pending", "failed", "blank")) {
			news.saveCollected(draft(id, List.of(NewsCategory.JOB), null, null, true, null, asOf));
		}
		for (SummaryTarget t : news.summaryTargets(100)) {
			if (t.title().equals("failed 제목")) news.applySummaries(List.of(new SummaryResult(t.id(), t.contentHash(), null)));
			if (t.title().equals("blank 제목")) news.applySummaries(List.of(new SummaryResult(t.id(), t.contentHash(), " \n\t ")));
		}
		jdbc.update("UPDATE youth_news SET summary = '마감된 소식 요약' WHERE external_id = 'closed-old'");
	}

	private static PolicyDraft draft(String id, List<NewsCategory> c, Integer min, Integer max, boolean nationwide, List<String> regions, LocalDate asOf) {
		return new PolicyDraft("FAKE", id, "{\"id\":\"" + id + "\"}", id + " 제목", c, min, max, Boolean.TRUE, nationwide, regions,
				LocalDate.of(2026, 10, 1), LocalDate.of(2099, 12, 31), false, "○○기관(예시)", "https://example.com/" + id, asOf, null, List.of("키워드"), null);
	}

	private static PolicyDraft closedLongAgo(String id, LocalDate asOf) {
		return new PolicyDraft("FAKE", id, "{\"id\":\"" + id + "\"}", id + " 제목", List.of(NewsCategory.FINANCE), 19, 34, Boolean.TRUE, true, null,
				LocalDate.of(2020, 1, 1), LocalDate.of(2020, 1, 31), false, "○○기관(예시)", "https://example.com/" + id, asOf, null, List.of("키워드"), null);
	}

	private void view(String externalId, String viewer, int expected) throws Exception {
		long id = jdbc.queryForObject("SELECT id FROM youth_news WHERE external_id = ?", Long.class, externalId);
		mvc.perform(post("/api/v1/youth-news/" + id + "/views").contentType(MediaType.APPLICATION_JSON).content("{\"viewerId\":\"" + viewer + "\"}"))
			.andExpect(status().is(expected));
	}

	@Test
	void 열람은_방문자_소식_날짜당_한_번만_세고_많이_본_순으로_내려준다() throws Exception {
		jdbc.update("DELETE FROM youth_news_view");
		// 변경 전 누적된 미요약 소식의 열람도 인기 목록에서 제외한다.
		jdbc.update("INSERT INTO youth_news_view (news_id, viewer_id, viewed_on) SELECT id, 'old-viewer', CURRENT_DATE FROM youth_news WHERE external_id IN ('pending', 'failed', 'blank')");
		String a = "11111111-1111-4111-8111-111111111111";
		String b = "22222222-2222-4222-8222-222222222222";
		mvc.perform(get("/api/v1/youth-news/hot")).andExpect(status().isOk()).andExpect(jsonPath("$.items", hasSize(0))).andExpect(jsonPath("$.basis", is("SITE")));
		view("seoul-rent", a, 204);
		view("seoul-rent", a, 204); // 같은 방문자·같은 날은 한 번
		view("seoul-rent", b, 204);
		view("all-savings", a, 204);
		mvc.perform(get("/api/v1/youth-news/hot"))
			.andExpect(status().isOk())
			.andExpect(header().string("Cache-Control", "max-age=60, public"))
			.andExpect(jsonPath("$.windowDays", is(7)))
			.andExpect(jsonPath("$.items", hasSize(2)))
			.andExpect(jsonPath("$.items[0].visitors", is(2)))
			.andExpect(jsonPath("$.items[1].visitors", is(1)));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM youth_news_view WHERE viewer_id <> 'old-viewer'", Long.class)).isEqualTo(3);
	}

	@Test
	void 열람은_잘못된_방문자_값과_없는_소식_반려한_소식을_받지_않는다() throws Exception {
		view("seoul-rent", "not-a-uuid", 400);
		mvc.perform(post("/api/v1/youth-news/999999/views").contentType(MediaType.APPLICATION_JSON).content("{\"viewerId\":\"11111111-1111-4111-8111-111111111111\"}"))
			.andExpect(status().isNotFound());
		view("rejected", "11111111-1111-4111-8111-111111111111", 404);
		view("pending", "11111111-1111-4111-8111-111111111111", 404);
		view("failed", "11111111-1111-4111-8111-111111111111", 404);
		view("blank", "11111111-1111-4111-8111-111111111111", 404);
	}

	@Test
	void 방문자_한_명이_하루에_셀_수_있는_소식은_한도까지다() throws Exception {
		jdbc.update("DELETE FROM youth_news_view");
		String viewer = "33333333-3333-4333-8333-333333333333";
		for (long n = 1; n <= NewsViewService.DAILY_CAP_PER_VIEWER; n++) {
			jdbc.update("INSERT INTO youth_news_view (news_id, viewer_id, viewed_on) VALUES (?, ?, ?)", 100000 + n, viewer,
				LocalDate.now(java.time.ZoneId.of("Asia/Seoul"))); // 서비스가 서울 날짜로 세므로 DB의 UTC 날짜(CURRENT_DATE)와 자정 전후 9시간 어긋난다
		}
		view("seoul-rent", viewer, 204);
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM youth_news_view WHERE viewer_id = ?", Long.class, viewer))
			.isEqualTo((long) NewsViewService.DAILY_CAP_PER_VIEWER);
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
			.andExpect(jsonPath("$.items[0].applyDeadline", is("2099-12-31")))
			.andExpect(jsonPath("$.items[0].source.org", is("○○기관(예시)")))
			.andExpect(jsonPath("$.items[0].source.url", is("https://example.com/seoul-rent")))
			.andExpect(jsonPath("$.items[0].source.asOf", is("2026-10-21")))
			.andExpect(jsonPath("$.items[0].calcLink", nullValue()))
			.andExpect(jsonPath("$.items[1].category", is("FINANCE")))
			.andExpect(jsonPath("$.items[1].categories", contains("FINANCE", "CULTURE")))
			.andExpect(jsonPath("$.items[1].regions", is("NATIONWIDE")))
			.andExpect(jsonPath("$.items[1].slot", is("MAIN")))
			.andExpect(jsonPath("$.items[1].calcLink.to", is("/savings?policy=1")))
			.andExpect(jsonPath("$.items[1].summary", is("all-savings 제목 요약")))
			.andExpect(jsonPath("$.items[2].summary", is("busan-job 제목 요약")))
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
		// 공개되지 않은 미요약 카드도 요약 대상이다. 검사 탈락·공백도 같은 원문이면 다시 부르지 않는다.
		assertThat(news.summaryTargets(100)).extracting(SummaryTarget::title).containsExactly("pending 제목");
		assertThat(news.summaryTargets(1)).hasSize(1);
		// 원문이 바뀌면 다시 대상이 되고, 그사이 원문이 또 바뀌면 옛 요약은 넣지 않는다
		jdbc.update("UPDATE youth_news_raw SET content_hash = 'changed' WHERE external_id = 'seoul-rent'");
		SummaryTarget rent = news.summaryTargets(100).stream().filter(t -> t.title().equals("seoul-rent 제목")).findFirst().orElseThrow();
		assertThat(rent.contentHash()).isEqualTo("changed");
		assertThat(news.applySummaries(List.of(new SummaryResult(rent.id(), "older", "옛 원문 요약")))).isZero();
		jdbc.update("UPDATE youth_news_raw SET content_hash = (SELECT summary_hash FROM youth_news WHERE external_id = 'seoul-rent') WHERE external_id = 'seoul-rent'");
	}

	@Test
	void 미요약_초안은_보존하고_요약이_완료되면_공개한다() throws Exception {
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM youth_news WHERE external_id IN ('pending', 'failed', 'blank')", Integer.class)).isEqualTo(3);
		SummaryTarget pending = news.summaryTargets(100).getFirst();
		assertThat(pending.title()).isEqualTo("pending 제목");
		news.applySummaries(List.of(new SummaryResult(pending.id(), pending.contentHash(), "완료된 AI 요약")));
		mvc.perform(get("/api/v1/youth-news")).andExpect(jsonPath("$.items", hasSize(5)));
		view("pending", "11111111-1111-4111-8111-111111111111", 204);
	}

	@Test
	void 원문이_바뀌면_이전_요약을_비우고_재요약_완료_후_공개한다() {
		PolicyDraft d = draft("seoul-rent", List.of(NewsCategory.HOUSING), 19, 34, false, List.of("서울"), LocalDate.of(2026, 10, 21));
		news.saveCollected(new PolicyDraft(d.source(), d.externalId(), "{\"changed\":true}", d.title(), d.categories(), d.ageMin(), d.ageMax(),
				d.incomeLimit(), d.nationwide(), d.regions(), d.applyStart(), d.applyDeadline(), d.alwaysOpen(), d.sourceOrg(), d.sourceUrl(), d.asOf(), d.postedAt(), d.keywords(), d.bizEnd()));
		assertThat(news.list(null, null, null).items()).extracting(i -> i.title()).doesNotContain("seoul-rent 제목");
		SummaryTarget target = news.summaryTargets(100).stream().filter(t -> t.title().equals("seoul-rent 제목")).findFirst().orElseThrow();
		assertThat(news.applySummaries(List.of(new SummaryResult(target.id(), "old-hash", "이전 요약")))).isZero();
		news.applySummaries(List.of(new SummaryResult(target.id(), target.contentHash(), "변경된 원문의 요약")));
		assertThat(news.list(null, null, null).items()).extracting(i -> i.title()).contains("seoul-rent 제목");
	}

	@Test
	void JSON_필드_순서와_공백만_바뀌면_기존_요약을_유지한다() {
		PolicyDraft d = draft("seoul-rent", List.of(NewsCategory.HOUSING), 19, 34, false, List.of("서울"), LocalDate.of(2026, 10, 21));
		news.saveCollected(withPayload(d, "{\"id\":\"seoul-rent\",\"content\":{\"a\":1,\"b\":2}}"));
		SummaryTarget target = news.summaryTargets(100).stream().filter(t -> t.title().equals(d.title())).findFirst().orElseThrow();
		news.applySummaries(List.of(new SummaryResult(target.id(), target.contentHash(), "유지할 요약")));
		assertThat(news.saveCollected(withPayload(d, " { \"content\": {\"b\":2,\"a\":1}, \"id\": \"seoul-rent\" } "))).isEqualTo(NewsDtos.SaveOutcome.UNCHANGED);
		assertThat(news.list(null, null, null).items()).filteredOn(i -> i.title().equals(d.title())).extracting(i -> i.summary()).containsExactly("유지할 요약");
		assertThat(news.summaryTargets(100)).extracting(SummaryTarget::title).doesNotContain(d.title());
	}

	private static PolicyDraft withPayload(PolicyDraft d, String payload) {
		return new PolicyDraft(d.source(), d.externalId(), payload, d.title(), d.categories(), d.ageMin(), d.ageMax(), d.incomeLimit(),
				d.nationwide(), d.regions(), d.applyStart(), d.applyDeadline(), d.alwaysOpen(), d.sourceOrg(), d.sourceUrl(), d.asOf(), d.postedAt(), d.keywords(), d.bizEnd());
	}
}
