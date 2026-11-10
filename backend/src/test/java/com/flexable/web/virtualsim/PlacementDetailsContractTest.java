package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;

import org.junit.jupiter.api.Test;

import com.atlassian.oai.validator.OpenApiInteractionValidator;
import com.atlassian.oai.validator.model.Request;
import com.atlassian.oai.validator.model.SimpleResponse;
import com.atlassian.oai.validator.report.LevelResolver;
import com.atlassian.oai.validator.report.ValidationReport;
import com.flexable.web.virtualsim.VirtualContestDtos.Placement;
import com.flexable.web.virtualsim.VirtualContestDtos.Question;

import tools.jackson.databind.json.JsonMapper;

/**
 * 실제 공시 문제(DS005·공급 계약 원문에서 만든 공시 주요 내용, 검사를 통과한 공시 AI 요약)가 계약(VirtualContestPlacement)과 맞는지, 회사·상대방 이름·날짜·절대 금액이 응답에 없는지 본다.
 * API 테스트는 예시 자료(VIRTUAL_SIM_SOURCE=fake)로 돌아 실제 공시 경로는 여기서 확인한다.
 */
class PlacementDetailsContractTest {

	private static final OpenApiInteractionValidator VALIDATOR;

	static {
		try {
			VALIDATOR = OpenApiInteractionValidator.createForInlineApiSpecification(Files.readString(Path.of("..", "docs", "contracts", "web-api.yaml")))
				.withLevelResolver(LevelResolver.create().withLevel("validation.schema.additionalProperties", ValidationReport.Level.ERROR).build())
				.build();
		}
		catch (Exception e) {
			throw new IllegalStateException(e);
		}
	}

	/** 실제 DS005 응답처럼 회사·상대방 이름·날짜·절대 금액 칸이 함께 든 행 */
	private static final Map<String, Map<String, String>> ROWS = Map.of(
			"주요사항보고서(유상증자결정)", Map.of("rcept_no", "20250408000001", "corp_name", "한빛전자", "nstk_ostk_cnt", "1,234,567", "bfic_tisstk_ostk", "45,678,901",
					"fdpp_fclt", "33,333,333,333", "fdpp_ocsa", "11,111,111,111", "ic_mthn", "제3자배정증자(대상자: 홍길동)", "ssl_bgd", "2025년 04월 10일"),
			"주요사항보고서(전환사채권발행결정)", Map.of("rcept_no", "20250408000002", "corp_name", "한빛전자", "bd_fta", "15,000,000,000", "nstk_isstk_tisstk_vs",
					"3.21", "cvisstk_tisstk_vs", "4.56", "bd_intr_ex", "1.0", "bd_intr_sf", "3.5", "cv_prc", "23,450", "pymd", "2025-05-01", "rpmcmp", "가람증권"),
			"주요사항보고서(회사합병결정)", Map.of("rcept_no", "20250408000003", "mg_stn", "소규모합병", "mg_mth", "한빛전자가 누리소재를 흡수합병", "mgptncmp_cmpnm", "누리소재",
					"mgptncmp_rl_cmpn", "계열회사", "rbsnfdtl_tast", "123,456,789,012", "mg_rt", "1 : 0.3768421", "mgsc_mgdt", "2025-07-01"),
			"주요사항보고서(유형자산양수결정)", Map.of("rcept_no", "20250408000004", "ast_sen", "토지 및 건물", "ast_nm", "서울시 중구 사옥", "inhdtl_inhprc", "98,765,432,100",
					"inhdtl_tast", "1,987,654,321,000", "dlptn_cmpnm", "가람개발", "inh_prd_ctr_cnsd", "2025-04-08"));

	/** 공급 계약 공시의 원문 본문 글(가상 값, 실제 단일판매·공급계약체결 칸 순서)과 그 공시의 AI 요약 */
	private static final String SOURCE = "2. 계약내역 | 계약금액(원) | 12,345,678,900\n최근 매출액(원) | 144,055,760,000\n매출액 대비(%) | 8.57\n"
			+ "3. 계약상대방 | 누리소재(주)\n5. 계약기간 | 시작일 | 2025-04-07\n종료일 | 2026-10-06\n7. 계약(수주)일자 | 2025-04-07";
	private static final String SUMMARY = "이 회사가 다른 회사와 설비 공급 계약을 맺었다고 알렸어요. 계약 금액은 100억~500억 원 규모로 최근 매출액의 8.5%에 해당해요.";

	@Test
	void 실제_공시_문제의_주요_내용이_계약과_맞고_단서가_없다() throws Exception {
		java.util.Set<String> names = new java.util.HashSet<>(PlacementSummaries.names(SOURCE));
		names.add("한빛전자");
		assertThat(PlacementSummaries.check(SUMMARY, SOURCE, names).summary()).isEqualTo(SUMMARY);
		List<LocalDate> dates = new ArrayList<>();
		List<Long> closes = new ArrayList<>();
		for (int i = 0; i < 20; i++) {
			dates.add(LocalDate.of(2025, 4, 1).plusDays(i));
			closes.add(10_000L + i * 10);
		}
		List<VirtualContestQuestions.Filing> filings = new ArrayList<>();
		List<String> titles = new ArrayList<>(ROWS.keySet());
		titles.add("단일판매ㆍ공급계약체결");
		for (int i = 0; i < titles.size(); i++) {
			String title = titles.get(i);
			String api = PlacementDetails.api(title);
			filings.add(new VirtualContestQuestions.Filing("r" + i, title, dates.get(i + 1),
					api != null ? PlacementDetails.items(api, ROWS.get(title)) : PlacementDetails.fromDocument(title) ? PlacementDetails.supplyContract(SOURCE) : null));
		}
		List<VirtualContestQuestions.Past> made = VirtualContestQuestions.fromFilings("한빛전자", "전자 부품", filings, dates, closes);
		assertThat(made).hasSize(titles.size());

		List<Question> questions = new ArrayList<>();
		for (int i = 0; i < 10; i++) {
			VirtualContestQuestions.Past p = made.get(i % made.size());
			// 공시 AI 요약: 검사를 통과한 요약이 있으면 싣는다(여기서는 공급 계약 공시)
			String summary = p.category() == VirtualSimCategory.SUPPLY_CONTRACT ? SUMMARY : null;
			questions.add(new Question("q" + (i + 1), p.industry(), p.category(), p.category().displayName(), p.title(), p.body(), p.details(), summary));
		}
		String body = JsonMapper.builder().build().writeValueAsString(new Placement("p1", "2026-11-06T12:30:00+09:00", VirtualContestQuestions.REACTION, questions));

		ValidationReport report = VALIDATOR.validateResponse("/api/v1/virtual-sim/contests/current/placement", Request.Method.POST,
				SimpleResponse.Builder.status(200).withContentType("application/json").withBody(body).build());
		assertThat(report.getMessages().stream().filter(m -> m.getLevel() == ValidationReport.Level.ERROR).map(ValidationReport.Message::getMessage)).as(body).isEmpty();

		// DS005 유형과 공급 계약(원문) 모두 항목이 있다. 실제 공시는 본문이 없다
		assertThat(made).allSatisfy(p -> assertThat(p.details()).isNotEmpty());
		assertThat(made).filteredOn(p -> p.category() == VirtualSimCategory.SUPPLY_CONTRACT)
			.allSatisfy(p -> assertThat(p.details()).containsExactly(new PlacementDetails.Detail("매출액 대비", "8.5%"), new PlacementDetails.Detail("계약 기간", "18개월")));
		assertThat(made).allSatisfy(p -> assertThat(p.body()).isNull());
		// 회사·상대방·주관사 이름, 날짜, 절대 금액·주식 수·가격·합병비율이 응답에 없다
		for (String clue : List.of("한빛전자", "누리소재", "가람증권", "가람개발", "홍길동", "사옥", "2025", "1,234,567", "45,678,901", "33,333", "15,000", "23,450",
				"123,456", "98,765", "0.3768421", "12,345", "144,055", "2026-10-06", "2025-04-07", "\"date\"", "\"company\"", "rcept")) {
			assertThat(body).as(clue).doesNotContain(clue);
		}
		assertThat(body).contains(SUMMARY);
		assertThat(body).contains("2.7%").contains("4.5%").contains("표면 1.0% · 만기 3.5%").contains("계열회사").contains("토지·건물").contains("4.9%");
	}
}
