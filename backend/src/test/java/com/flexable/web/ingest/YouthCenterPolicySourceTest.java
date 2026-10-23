package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;
import static org.springframework.test.web.client.match.MockRestRequestMatchers.requestTo;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withServerError;
import static org.springframework.test.web.client.response.MockRestResponseCreators.withSuccess;

import java.time.Clock;
import java.time.Duration;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.util.List;

import org.junit.jupiter.api.Test;
import org.springframework.http.MediaType;
import org.springframework.test.web.client.ExpectedCount;
import org.springframework.test.web.client.MockRestServiceServer;
import org.springframework.web.client.RestClient;

import com.flexable.web.ingest.youthcenter.YouthCenterPolicySource;
import com.flexable.web.news.NewsCategory;
import com.flexable.web.news.NewsDtos.PolicyDraft;

/**
 * 온통청년 응답 → 카드 초안. fixture는 2026-10-21 실제 응답의 필드 이름·값 형식을 따른 가상 정책이다
 * (실제 원문을 넣지 않는다. 담당자 이름 등 개인 정보가 들어 있다).
 */
class YouthCenterPolicySourceTest {

	private static final String URL = "https://yc.test/go/ythip/getPlcy?apiKeyNm=KEY&pageNum=%d&pageSize=2&rtnType=json";
	// 2026-10-21 09:00 KST
	private final Clock clock = Clock.fixed(Instant.parse("2026-10-21T00:00:00Z"), ZoneOffset.UTC);

	private static final String PAGE_1 = """
			{"resultCode":200,"resultMessage":"정상적으로 처리되었습니다.","result":{"pagging":{"totCount":4,"pageNum":1,"pageSize":2},
			"youthPolicyList":[
			 {"plcyNo":"20250101000001","plcyNm":"청년 월세 지원","lclsfNm":"주거","mclsfNm":"전월세 및 주거급여 지원",
			  "sprtTrgtMinAge":"19","sprtTrgtMaxAge":"34","earnCndSeCd":"0043002","zipCd":"11110,11140",
			  "aplyPrdSeCd":"0057001","aplyYmd":"20261001 ~ 20261130","sprvsnInstCdNm":"서울특별시","sprvsnInstPicNm":"홍길동",
			  "aplyUrlAddr":"https://example.com/apply","plcyKywdNm":"월세,주거,월세","frstRegDt":"2026-09-25 10:00:00","lastMdfcnDt":"2026-10-02 11:00:00"},
			 {"plcyNo":"20250101000002","plcyNm":"구직 청년 면접 정장 대여","lclsfNm":"일자리","mclsfNm":"취업",
			  "sprtTrgtMinAge":"0","sprtTrgtMaxAge":"0","earnCndSeCd":"0043001","zipCd":"",
			  "aplyPrdSeCd":"0057002","aplyYmd":"","sprvsnInstCdNm":"경기도","aplyUrlAddr":"","refUrlAddr1":"",
			  "plcyKywdNm":"","frstRegDt":"","lastMdfcnDt":""}
			]}}
			""";

	private static final String PAGE_2 = """
			{"resultCode":200,"result":{"pagging":{"totCount":4,"pageNum":2,"pageSize":2},
			"youthPolicyList":[
			 {"plcyNo":"20250101000003","plcyNm":"청년 문화 이용권","lclsfNm":"금융･복지･문화","mclsfNm":"문화활동 및 생활지원",
			  "zipCd":"%s","sprvsnInstCdNm":"○○부"},
			 {"plcyNm":"번호 없는 정책은 건너뛴다"},
			 {"plcyNo":"20250101000004","plcyNm":"청년 직업훈련 지원","lclsfNm":"교육･직업훈련","mclsfNm":"미래역량강화","zipCd":"11110","sprvsnInstCdNm":"○○구"},
			 {"plcyNo":"20250101000005","plcyNm":"청년 정책 참여단","lclsfNm":"참여･기반","mclsfNm":"청년참여","zipCd":"11110","sprvsnInstCdNm":"○○구"}
			]}}
			""".formatted(String.join(",", List.of("11110", "26110", "27110", "28110", "12110", "30110", "31110", "36110", "41110", "51110", "43110",
			"44130", "52110", "12710", "47110", "48120", "50110")));

	private YouthCenterPolicySource source(RestClient.Builder builder, String key) {
		return new YouthCenterPolicySource(builder.build(), "https://yc.test", key, 2, 10, Duration.ZERO, clock, ZoneId.of("Asia/Seoul"));
	}

	@Test
	void 페이지를_넘기며_받아_초안으로_바꾼다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		// 온통청년은 JSON을 text/html로 줄 수 있어 문자열로 받아 읽는다
		server.expect(requestTo(URL.formatted(1))).andRespond(withSuccess(PAGE_1, MediaType.TEXT_HTML));
		server.expect(requestTo(URL.formatted(2))).andRespond(withSuccess(PAGE_2, MediaType.APPLICATION_JSON));

		List<PolicyDraft> all = source(builder, "KEY").policies();
		server.verify();
		assertThat(all).hasSize(5);

		PolicyDraft rent = all.get(0);
		assertThat(rent.source()).isEqualTo("YOUTH_CENTER");
		assertThat(rent.externalId()).isEqualTo("20250101000001");
		assertThat(rent.title()).isEqualTo("청년 월세 지원");
		assertThat(rent.categories()).containsExactly(NewsCategory.HOUSING);
		assertThat(rent.ageMin()).isEqualTo(19);
		assertThat(rent.ageMax()).isEqualTo(34);
		assertThat(rent.incomeLimit()).isTrue();
		assertThat(rent.nationwide()).isFalse();
		assertThat(rent.regions()).containsExactly("서울");
		assertThat(rent.applyStart()).isEqualTo(LocalDate.of(2026, 10, 1));
		assertThat(rent.applyDeadline()).isEqualTo(LocalDate.of(2026, 11, 30));
		assertThat(rent.alwaysOpen()).isFalse();
		assertThat(rent.sourceOrg()).isEqualTo("서울특별시");
		assertThat(rent.sourceUrl()).isEqualTo("https://example.com/apply");
		assertThat(rent.asOf()).isEqualTo(LocalDate.of(2026, 10, 2));
		assertThat(rent.postedAt()).isEqualTo(LocalDate.of(2026, 9, 25));
		assertThat(rent.keywords()).containsExactly("월세", "주거");
		assertThat(rent.payload()).contains("\"plcyNo\":\"20250101000001\"");
		// 담당자 이름은 원문에 저장하지 않는다
		assertThat(rent.payload()).doesNotContain("PicNm").doesNotContain("홍길동");

		// 원문에 없는 값은 만들지 않는다: 나이 0 → null, 지역 빈 값 → null, 링크 없음 → 온통청년 상세, 수정일 없음 → 받은 날
		PolicyDraft suit = all.get(1);
		assertThat(suit.categories()).containsExactly(NewsCategory.JOB);
		assertThat(suit.ageMin()).isNull();
		assertThat(suit.ageMax()).isNull();
		assertThat(suit.incomeLimit()).isFalse();
		assertThat(suit.regions()).isNull();
		assertThat(suit.nationwide()).isFalse();
		assertThat(suit.alwaysOpen()).isTrue();
		assertThat(suit.applyDeadline()).isNull();
		assertThat(suit.sourceUrl()).endsWith("/ythPlcyDetail/20250101000002");
		assertThat(suit.asOf()).isEqualTo(LocalDate.of(2026, 10, 21));
		assertThat(suit.postedAt()).isNull();
		assertThat(suit.keywords()).isEmpty();

		// 17개 시도가 다 있으면 전국(광주·전남은 통합 코드 12: 121xx 광주, 나머지 전남). 소득 조건이 없으면 null(언급 없음)
		PolicyDraft culture = all.get(2);
		// 대분류 '금융･복지･문화'라도 정책명에 금융 낱말이 없으면 생활·문화만
		assertThat(culture.categories()).containsExactly(NewsCategory.CULTURE);
		assertThat(culture.nationwide()).isTrue();
		assertThat(culture.regions()).isNull();
		assertThat(culture.incomeLimit()).isNull();

		// 교육은 따로 분야를 두고, 참여·기반처럼 맞는 분야가 없으면 빈 목록(저장할 때 기타)
		assertThat(all.get(3).categories()).containsExactly(NewsCategory.EDUCATION);
		assertThat(all.get(4).categories()).isEmpty();
	}

	@Test
	void 금융은_정책명으로_정한다() {
		// 같은 '금융･복지･문화'(중분류 '취약계층 및 금융지원')에도 금융과 무관한 정책이 섞여 있다(2026-10-23 실제 응답)
		assertThat(YouthCenterPolicySource.categories("2026 청년내일저축계좌", "금융･복지･문화")).containsExactly(NewsCategory.FINANCE, NewsCategory.CULTURE);
		assertThat(YouthCenterPolicySource.categories("대학생 천원의 아침밥 사업", "금융･복지･문화")).containsExactly(NewsCategory.CULTURE);
		assertThat(YouthCenterPolicySource.categories("2026 청년층 신용회복 지원사업", "복지문화")).containsExactly(NewsCategory.FINANCE, NewsCategory.CULTURE);
		// 다른 분류도 이름에 금융 낱말이 있으면 저축·금융을 더 붙인다. 대표 분야는 원래 분류
		assertThat(YouthCenterPolicySource.categories("청년 전세자금 대출이자 지원", "주거")).containsExactly(NewsCategory.HOUSING, NewsCategory.FINANCE);
		assertThat(YouthCenterPolicySource.categories("청년 월세 지원", "주거")).containsExactly(NewsCategory.HOUSING);
		assertThat(YouthCenterPolicySource.categories("청년 정책 참여단", null)).isEmpty();
	}

	@Test
	void 오류에는_키를_남기지_않는다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(URL.formatted(1)))
			.andRespond(withSuccess("{\"resultCode\":401,\"resultMessage\":\"인증키 KEY 오류\"}", MediaType.APPLICATION_JSON));
		assertThatThrownBy(() -> source(builder, "KEY").policies()).hasMessageContaining("401").hasMessageNotContaining("KEY");

		RestClient.Builder b2 = RestClient.builder();
		MockRestServiceServer s2 = MockRestServiceServer.bindTo(b2).build();
		s2.expect(ExpectedCount.times(3), requestTo(URL.formatted(1))).andRespond(withServerError());
		assertThatThrownBy(() -> source(b2, "KEY").policies()).hasMessageContaining("온통청년 호출 실패(1쪽, 3번 시도)").hasMessageNotContaining("apiKeyNm=KEY");
		s2.verify();
	}

	@Test
	void 가끔_나는_500은_다시_불러_넘긴다() {
		RestClient.Builder builder = RestClient.builder();
		MockRestServiceServer server = MockRestServiceServer.bindTo(builder).build();
		server.expect(requestTo(URL.formatted(1))).andRespond(withServerError());
		server.expect(requestTo(URL.formatted(1))).andRespond(withSuccess(PAGE_1, MediaType.APPLICATION_JSON));
		server.expect(requestTo(URL.formatted(2))).andRespond(withSuccess(PAGE_2, MediaType.APPLICATION_JSON));
		assertThat(source(builder, "KEY").policies()).isNotEmpty();
		server.verify();
	}

	@Test
	void 키가_없으면_쓰지_않는다() {
		assertThat(source(RestClient.builder(), "").enabled()).isFalse();
		assertThat(source(RestClient.builder(), null).enabled()).isFalse();
	}
}
