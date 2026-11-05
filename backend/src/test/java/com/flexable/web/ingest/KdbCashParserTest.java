package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.*;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class KdbCashParserTest {
    private static final OffsetDateTime AT = OffsetDateTime.parse("2026-11-05T10:00:00+09:00");
    private static final KdbCashParser.Candidate C = new KdbCashParser.Candidate("100000000001", "100000000001", "합성 입출금");
    static final String DETAIL = """
        {"COMMON_HEAD":{"ERROR":false},"BSC_DATA":{"PRD_C":"100000000001","PRD_IRT_C":"100000000001",
        "WGD_NM":"합성 입출금","WEB_PRD_CLSF_C":"10","SLE_YN":"Y","DPW_PRT_TGT_PRD_YN":"Y"},
        "DET_DATA":{"PRD_C":"100000000001","PRD_JIN_TGT_DES":"<p>실명의 개인</p>","JIN_MANR_DES":"<p>비대면</p>",
        "JIN_AMT_OTL":"제한없음","PRD_DES":"공시 예시"},
        "COL_LIST":[{"PRD_C":"100000000001","PRD_COL_NM":"이자지급시기","PRD_COL_DES_INF":"<p>매월 지급</p>"},
        {"PRD_C":"100000000001","PRD_COL_NM":"추가이율 이벤트","PRD_COL_DES_INF":"조건 충족 시 별도 적용"},
        {"PRD_C":"100000000001","PRD_COL_NM":"담당자","PRD_COL_DES_INF":"보관 금지 합성 이름"}]}
        """;
    static String rate(String tier, String rate) {
        return """
            {"PRD_C":"100000000001","PRD_IRT_C":"100000000001","BSE_DT":"20261105","DEL_YN":"N","OPB_YN":"Y",
            "MNG_ITSR_GRP_NM":"합성 입출금","MNG_PRD_IRT_STG_NM1":"%s","PRD_IRT_STG_NM1":"사용하지 않는 옛 조건",
            "AVR_ITSR":"%s"}
            """.formatted(tier, rate);
    }
    static String rates(String rows) {
        return "{\"COMMON_HEAD\":{\"ERROR\":false},\"BSE_DT\":\"20261105\",\"IRT_LIST\":[" + rows
            + "],\"HI_FIVE_LIST\":[{\"PRD_C\":\"999999999999\",\"AVR_ITSR\":\"99\"}]}";
    }
    static String row(String id) {
        return "{\"PRD_C\":\"" + id + "\",\"PRD_IRT_C\":\"" + id + "\",\"WGD_NM\":\"합성 입출금\","
            + "\"CTG_N1_NM\":\"입출금자유상품\",\"PRD_JIN_TGT_C\":\"10\",\"WEB_PRD_CLSF_C\":\"10\",\"SLE_YN\":\"Y\"}";
    }
    static String catalog(int total, String rows) {
        return "{\"COMMON_HEAD\":{\"ERROR\":false},\"HEADER_STD_WEB\":{\"TOT_PAG_ROW_CNT\":" + total
            + ",\"REQ_PAGE_NO\":1,\"PAGE_ROW_COUNT\":10,\"TOT_PAG_CNT\":1,\"NEXT_PAGE_YN\":\"N\"},\"GRID_LIST\":[" + rows + "]}";
    }
    @Test void onlyPersonalDemandCatalogIsAcceptedAndAllRowsAreRequired() {
        assertThat(KdbCashParser.catalog(catalog(1, row(C.id())), 1).items()).containsExactly(C);
        assertThatThrownBy(() -> KdbCashParser.catalog(catalog(2, row(C.id())), 1)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KdbCashParser.catalog(catalog(2, row(C.id()) + "," + row(C.id())), 1)).isInstanceOf(IllegalStateException.class);
        for (String invalid : new String[]{catalog(1, row(C.id())).replace("입출금자유상품", "외화예금"),
            catalog(1, row(C.id())).replace("\"PRD_JIN_TGT_C\":\"10\"", "\"PRD_JIN_TGT_C\":\"20\""),
            catalog(1, row(C.id())).replace("\"NEXT_PAGE_YN\":\"N\"", "\"NEXT_PAGE_YN\":\"Y\""),
            catalog(1, row(C.id())).replace("\"ERROR\":false", "\"ERROR\":true")}) {
            assertThatThrownBy(() -> KdbCashParser.catalog(invalid, 1)).isInstanceOf(IllegalStateException.class);
        }
    }
    @Test void tierRatesStayInConditionsAndUnverifiedHighestRateRemainsNull() {
        var p = KdbCashParser.detail(C, DETAIL, rates(rate("100만원 미만", "1.23") + "," + rate("100만원 이상", "2.34")), AT);
        assertThat(p.baseRate()).isNull(); assertThat(p.maxRate()).isNull();
        assertThat(p.conditions()).contains("100만원 미만", "1.23%", "100만원 이상", "2.34%", "별도 적용")
            .doesNotContain("99%", "보관 금지", "사용하지 않는 옛 조건");
        assertThat(p.interestPayment()).isEqualTo("매월 지급");
        assertThat(p.sourceAsOf()).hasToString("2026-11-05");
        assertThat(p.effectiveFrom()).isNull(); assertThat(p.rateLimit()).isNull();
        assertThat(p.depositProtected()).isTrue();
        assertThat(p.verifiedAt()).isEqualTo(AT);
    }
    @Test void uniformRateIsPublishedWithoutAddingEventRatesOrRecommendationRows() {
        var p = KdbCashParser.detail(C, DETAIL, rates(rate("-", "1.23")), AT);
        assertThat(p.baseRate()).isEqualByComparingTo("1.23"); assertThat(p.maxRate()).isNull();
    }
    @Test void currentRateTableMayUseADifferentRateGroupForTheSameProduct() {
        String ownRate = rate("100만원 미만", "1.23").replace("\"PRD_IRT_C\":\"100000000001\"", "\"PRD_IRT_C\":\"100000000002\"");
        assertThat(KdbCashParser.detail(C, DETAIL, rates(ownRate), AT).baseRate()).isEqualByComparingTo("1.23");
    }
    @Test void wrongProductMissingPaymentAndInvalidRateRejectWholeSource() {
        assertThatThrownBy(() -> KdbCashParser.detail(C, DETAIL.replace("매월 지급", ""), rates(rate("-", "1.23")), AT))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KdbCashParser.detail(C, DETAIL, rates(rate("-", "1.23").replace(C.id(), "999999999999")), AT))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KdbCashParser.detail(C, DETAIL, rates(rate("-", "NaN")), AT)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> KdbCashParser.detail(C, DETAIL.replace("합성 입출금", "다른 상품"), rates(rate("-", "1.23")), AT))
            .isInstanceOf(IllegalStateException.class);
    }
}
