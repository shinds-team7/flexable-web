package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.*;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;
import tools.jackson.databind.json.JsonMapper;

class OfficialCashJsonParserTest {
    private final OffsetDateTime at = OffsetDateTime.parse("2026-11-04T10:00:00+09:00");
    @Test void fsbRejectsPartialResponsesAndKeepsTermsWithoutContactFields() {
        var products = OfficialCashJsonParser.fsb(fsb(), at);
        assertThat(products).hasSize(2);
        assertThat(products.getFirst().conditions()).contains("1000000 이하", "급여 이체", "스마트폰");
        assertThat(products.getLast().conditions()).contains("1000000 초과");
        assertThat(products.getFirst().interestPayment()).isEqualTo("월지급");
        assertThat(products.getFirst().rateLimit()).isNull();
        assertThat(products.getLast().rateLimit()).isNull();
        assertThat(products.getFirst().sourceAsOf()).hasToString("2026-10-30");
        assertThat(JsonMapper.builder().build().writeValueAsString(products)).doesNotContain("SENTINEL_CONTACT", "OWNER", "TEL");
        assertThatThrownBy(() -> OfficialCashJsonParser.fsb(fsb().replace("\"TOTAL_CNT\":2", "\"TOTAL_CNT\":3"), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashJsonParser.fsb(fsb().replace("company-b", "company-a"), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashJsonParser.fsb(fsb().replace("\"DEPO_INTS_PRVS_MTHD_CD\":\"2\"", "\"DEPO_INTS_PRVS_MTHD_CD\":\"99\""), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void samsungUsesQueriedCmaRatesNotHtmlPlaceholdersOrSpecialOffers() {
        var products = OfficialCashJsonParser.samsung(samsungHtml(), samsungRp(), samsungNote(), at);
        assertThat(products).hasSize(2);
        assertThat(products.getFirst().baseRate()).isEqualByComparingTo("1.23");
        assertThat(products.getLast().baseRate()).isEqualByComparingTo("2.34");
        assertThat(products.getLast().category()).isEqualTo("PROMISSORY_NOTE");
        assertThat(products.getLast().reinvestment()).contains("31일");
        assertThat(products.getLast().conditions()).doesNotContain("99.99");
        assertThat(products.getLast().sourceAsOf()).hasToString("2026-11-01");
        assertThatThrownBy(() -> OfficialCashJsonParser.samsung(samsungHtml(), samsungRp().replace("\"errorMsg\":\"\"", "\"errorMsg\":\"error\""), samsungNote(), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashJsonParser.samsung(samsungHtml(), samsungRp(), samsungNote().replace("\"5\"", "\"2\""), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void kbSeparatesPersonalAutomaticInvestmentFromCorporateAndPeriodRp() {
        var products = OfficialCashJsonParser.kb(kb(), at);
        assertThat(products).hasSize(2);
        assertThat(products.getFirst().baseRate()).isEqualByComparingTo("1.23");
        assertThat(products.getLast().maxRate()).isEqualByComparingTo("2.34");
        assertThat(products.getLast().sourceAsOf()).hasToString("2026-10-30");
        assertThat(products.getLast().reinvestment()).contains("1일");
    }
    @Test void shinhanSelectsThePersonalCmaCodeAndDoesNotInventAnAsOfDate() {
        var product = OfficialCashJsonParser.shinhan(shinhan(), at).getFirst();
        assertThat(product.baseRate()).isEqualByComparingTo("1.23");
        assertThat(product.maxRate()).isEqualByComparingTo("2.34");
        assertThat(product.conditions()).contains("1-27일", "28일");
        assertThat(product.sourceAsOf()).isNull();
        assertThatThrownBy(() -> OfficialCashJsonParser.shinhan(shinhan().replace("2000", "9999"), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void meritzRejectsCorporateOrIncompleteContinuationResults() {
        var product = OfficialCashJsonParser.meritz(meritz(), at).getFirst();
        assertThat(product.baseRate()).isEqualByComparingTo("1.23");
        assertThat(product.reinvestment()).contains("세후");
        assertThatThrownBy(() -> OfficialCashJsonParser.meritz(meritz().replace("\"sysNextYn\":\"N\"", "\"sysNextYn\":\"Y\""), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashJsonParser.meritz(meritz().replace("\"CustClsCode\":\"1\"", "\"CustClsCode\":\"2\""), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void kbankKeepsConditionalTiersAndDoesNotDuplicateThePlusboxSource() {
        var products = OfficialCashJsonParser.kbankOther(kbankOther(), at);
        assertThat(products).hasSize(1);
        assertThat(products.getFirst().baseRate()).isEqualByComparingTo("0.10");
        assertThat(products.getFirst().maxRate()).isEqualByComparingTo("2.34");
        assertThat(products.getFirst().rateLimit()).isNull();
        assertThat(products.getFirst().conditions()).contains("모임 금리 조건 충족 시", "3백만원 이하");
        assertThatThrownBy(() -> OfficialCashJsonParser.kbankOther(kbankOther().replace("SALE", "STOP"), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void skChecksThePersonalRowAgainstTheDisplayedRateAndCount() {
        assertThat(OfficialCashJsonParser.sk(sk(), at).getFirst().baseRate()).isEqualByComparingTo("1.23");
        assertThatThrownBy(() -> OfficialCashJsonParser.sk(sk().replace("1.23%", "2.34%"), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashJsonParser.sk(sk().replace("\"QueryCnt\":\"2\"", "\"QueryCnt\":\"3\""), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void hanwhaKeepsUnspecifiedBasicRateUnknownAndHmcKeepsSalaryScope() {
        var hanwha = OfficialCashJsonParser.hanwha(hanwha(), at).getFirst();
        assertThat(hanwha.baseRate()).isNull();
        assertThat(hanwha.maxRate()).isEqualByComparingTo("2.34");
        assertThat(hanwha.conditions()).contains("1.23% ~ 2.34%", "개별 금액 구간");
        var hmc = OfficialCashJsonParser.hmc(hmc(), at).getFirst();
        assertThat(hmc.name()).contains("급여계좌");
        assertThat(hmc.baseRate()).isEqualByComparingTo("1.23");
        assertThat(hmc.sourceAsOf()).hasToString("2026-10-30");
    }
    @Test void scComparesTheIndependentProductListAndDoesNotAddBonusRates() {
        var product = OfficialCashJsonParser.sc(scRates(), scCatalog(), at).getFirst();
        assertThat(product.company()).isEqualTo("SC제일은행");
        assertThat(product.baseRate()).isEqualByComparingTo("0.10");
        assertThat(product.maxRate()).isNull();
        assertThat(product.sourceAsOf()).isNull();
        assertThat(product.effectiveFrom()).hasToString("2026-10-30");
        assertThat(product.conditions()).contains("보너스", "신규 가입");
        assertThatThrownBy(() -> OfficialCashJsonParser.sc(scRates(), scCatalog().replace("\"b\"", "\"c\""), at)).isInstanceOf(IllegalStateException.class);
    }
    static String fsb() {
        String row = """
            {"FINAN_COMP_CODE":"company-a","FINAN_PROD_CODE":"product","CNT":"2","BANK_NAME":"합성가","PRODUCT_NAME":"보통예금",
             "HGST_INTR_APL_AMT":"1000000","RNG_CODE":"2","SWEETENER":"급여 이체","JOIN_TARGET":"개인","JOIN_LOCATION":"2,3",
             "ETC_NOTE_MATTER":"없음","RATE_LOW":"0.10","RATE_HIGH":"2.34","DEPO_INTS_PRVS_MTHD_CD":"2","START_DATE":"20261030",
             "OWNER":"SENTINEL_CONTACT","TEL":"SENTINEL_CONTACT"}
            """;
        return "{\"TOTAL_CNT\":2,\"ANYM_REC\":[" + row + "," + row.replace("company-a", "company-b").replace("\"RNG_CODE\":\"2\"", "\"RNG_CODE\":\"3\"") + "]}";
    }
    static String samsungHtml() { return """
        <table><caption>CMA RP형<p>안내</p></caption><tbody><tr><th>자동매수</th><td>매일 RP 자동 매수</td></tr>
        <tr><th>재투자</th><td>재투자 없음</td></tr><tr><th>수수료</th><td>없음</td></tr>
        <tr><th>자동매수<br>가능<br>시간대</th><td>영업일</td></tr><tr><th>수익률</th><td>99.99%</td></tr></tbody></table>
        <table><caption>CMA 발행어음형</caption><tbody><tr><th>자동매수</th><td>매일 발행어음 자동 매수</td></tr>
        <tr><th>재투자</th><td>만기 31일 재투자</td></tr><tr><th>수수료</th><td>없음</td></tr>
        <tr><th>자동매수가능시간대</th><td>매일</td></tr><tr><th>수익률</th><td>99.99%</td></tr></tbody></table>
        """; }
    static String samsungRp() { return """
        {"result":{"outRec1":{"A_NDVL_RP_ANCT_YILD":"0001.230000","A_INSN_RP_ANCT_YILD":"99","ANCT_DATE":"20261030"}},"errorMsg":""}
        """; }
    static String samsungNote() { return """
        {"result":{"outRec1":{"BSNS_DATE":"20261101"},"outRec2":[{"shrt_BILL_PRDT_SECT_CODE":"3","prdt_NAME":"특판","frst_SHRT_BILL_ANCT_YILD":"99"},
        {"shrt_BILL_PRDT_SECT_CODE":"5","prdt_NAME":"CMA   ","frst_SHRT_BILL_ANCT_YILD":"0002.340000"}]},"errorMsg":""}
        """; }
    static String kb() { return """
        {"cma100":"기준일 : 2026/10/30, 세전","cma200":"2022/01/01","cma111":"연 1.23%","cma112":"연 2.34%","cma121":"연 99%","cma131":"연 88%",
        "cma001":"31일단위 재투자","cma002":"1일단위 재투자"}
        """; }
    static String shinhan() { return """
        {"header":{"succesCode":"0"},"body":{"list01":{"outputList":[{"rp_fund_code":"2001","fund_nm1":"법인 CMA","intrt1":"99"},
        {"rp_fund_code":"2000","fund_nm1":"명품 CMA RP(개인)","cntt1":"1-27일","cntt2":"28일","intrt1":"1.23","intrt2":"2.34","amt_base":"1원 이상"}]}}}
        """; }
    static String meritz() { return """
        {"sysCode":"0","sysNextYn":"N","resultList":[[{"Iscd":"RP10000","KorIssuAbwrName":"CMA-RP","CustClsCode":"1","AplyInrt":"0001.2300000000","StplDynu":"30","InrtAplyDate":"20261030"}]]}
        """; }
    static String kbankOther() { return """
        {"_msg_":{"_common_":{"resCode":"00","error.code":"F0000"},"_body_":{"inqryType":"SALE","inqryBaseDt":"20261030","pdInfoList10":[
        {"pdCd":"a","pdNm":"생활통장","typeList1":[{"rate":"0.10","amtStcn":"전체구간"}],"typeList4":[],"typeList5":[{"rate":"2.34","amtStcn":"3백만원+이하"}]},
        {"pdCd":"b","pdNm":"플러스박스"},{"pdCd":"c","pdNm":"사장님통장"}]}}}
        """; }
    static String sk() { return """
        {"output":{"h_errcode":"","QueryCnt":"2","OutBlock_2":[{"rp_dcd":"10","inv_cnt":"30일","rp_int_rt":"99"},{"rp_dcd":"30","inv_cnt":"1일","rp_int_rt":"1.23"}],"o_rp_int_rt":"1.23%","bs_dt_format":"2026.10.30"}}
        """; }
    static String hanwha() { return """
        <div class="FI211_1p_numList"><ol><li><p>첫째, 금액 구간별 세전, 연 1.23% ~ 2.34%, 2026.10.30 기준 RP 자동투자</p></li></ol></div>
        """; }
    static String hmc() { return """
        <h1>급여계좌 장점</h1><ul class="dot_list"><li><span>하루를 맡겨도 연 1.23% 금리 지급</span>(2026-10-30 기준, RP형, 세전), 수시 입출금 가능</li></ul>
        """; }
    static String scCatalog() { return """
        {"vector":[{"OUTPUT":{"PRDCT_ID":"a","PRDCT_NM":"합성통장"}},{"OUTPUT":{"PRDCT_ID":"b","PRDCT_NM":"기업통장"}}]}
        """; }
    static String scRates() { return """
        {"vector":[{"OUTPUT":{"PRDCT_ID":"a","INT_RATE_TYPE":"입출금자유","INT_RATE_TTL":"기본이율","ENTRNC_TYPE":"인터넷","DFLT_INT_RATE":"0.10","INT_EFFCTV_DT":"2026-10-30","ADDTNL_IN_VAL":"보너스 금리는 별도 조건"}},
        {"OUTPUT":{"PRDCT_ID":"b","INT_RATE_TYPE":"입출금자유","INT_RATE_TTL":"기본이율","ENTRNC_TYPE":"영업점","DFLT_INT_RATE":"99","INT_EFFCTV_DT":"2026-10-30"}}]}
        """; }
}
