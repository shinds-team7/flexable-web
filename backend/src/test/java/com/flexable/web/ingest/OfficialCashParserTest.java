package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.*;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class OfficialCashParserTest {
    private final OffsetDateTime at = OffsetDateTime.parse("2026-11-04T10:00:00+09:00");
    @Test void fsbKeepsEveryExportRowAndDoesNotInventMissingTerms() {
        var products = OfficialCashParser.fsbExport(fsb(), at);
        assertThat(products).hasSize(2);
        var first = products.getFirst();
        assertThat(first.company()).isEqualTo("가저축은행");
        assertThat(first.name()).isEqualTo("보통예금");
        assertThat(first.baseRate()).isEqualByComparingTo("0.10");
        assertThat(first.maxRate()).isEqualByComparingTo("3.20");
        assertThat(first.conditions()).contains("100만원 이하", "전체 잔액");
        assertThat(first.rateLimit()).isNull();
        assertThat(first.depositProtected()).isNull();
        assertThat(first.interestPayment()).isNull();
        assertThat(first.sourceAsOf()).hasToString("2026-10-30");
        assertThat(products.getLast().id()).isNotEqualTo(first.id()); // 같은 상품명, 다른 회사
        assertThatThrownBy(() -> OfficialCashParser.fsbExport(fsb().replace("나저축은행", "가"), at))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashParser.fsbExport(fsb().replace("<td>2.00%</td>", ""), at))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashParser.fsbExport(fsb().replaceAll("(?s)<tbody>.*?</tbody>", "<tbody></tbody>"), at))
            .isInstanceOf(IllegalStateException.class);
    }
    @Test void miraeUsesOnlyPersonalCmaAndRejectsAmbiguousRows() {
        var product = OfficialCashParser.miraeRp(mirae(), at).getFirst();
        assertThat(product.baseRate()).isEqualByComparingTo("1.23");
        assertThat(product.category()).isEqualTo("RP");
        assertThat(product.sourceAsOf()).isNull();
        assertThat(product.conditions()).contains("법인", "네이버통장");
        assertThatThrownBy(() -> OfficialCashParser.miraeRp(mirae().replace("CMA RP_개인", "일반 RP"), at))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashParser.miraeRp(mirae() + mirae(), at))
            .isInstanceOf(IllegalStateException.class);
    }
    @Test void kbankScopesRatesToTheTierTableAndPreservesThresholdMeaning() {
        var product = OfficialCashParser.kbank(kbank(), at).getFirst();
        assertThat(product.baseRate()).isEqualByComparingTo("1.23");
        assertThat(product.maxRate()).isEqualByComparingTo("2.34");
        assertThat(product.rateLimit()).isNull(); // 초과분 기준액을 최고 적용 한도로 오인하지 않는다
        assertThat(product.conditions()).contains("5천만원 초과분", "구간별");
        assertThat(product.sourceAsOf()).hasToString("2026-10-30");
        assertThat(product.effectiveFrom()).isNull();
        assertThat(product.verifiedAt()).isEqualTo(at);
        assertThatThrownBy(() -> OfficialCashParser.kbank(kbank().replace("2.34%", "미정"), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashParser.kbank(kbank().replace("2.34%", "2,34%"), at)).isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> OfficialCashParser.kbank(kbank().replace("초과분", "이하"), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void eugeneSeparatesPersonalTypesAndDoesNotUseTheCorporateRate() {
        var products = OfficialCashParser.eugene(eugene(), at);
        assertThat(products).hasSize(2);
        assertThat(products.getFirst().baseRate()).isEqualByComparingTo("2.10");
        assertThat(products.getLast().maxRate()).isEqualByComparingTo("2.30");
        assertThat(products.getLast().conditions()).contains("1일 ~ 15일", "16일 ~ 30일");
        assertThat(products.getFirst().reinvestment()).isNull();
        assertThat(products.getLast().reinvestment()).contains("재투자");
        assertThatThrownBy(() -> OfficialCashParser.eugene(eugene().replace("CMA - RP 수익률", "변경된 표"), at)).isInstanceOf(IllegalStateException.class);
    }
    @Test void robotsRespectsSpecificAgentsAndLongestPaths() {
        assertThat(CashRobots.allowed("User-agent: *\nDisallow: /\nUser-agent: Googlebot\nAllow: /", "/product")).isFalse();
        assertThat(CashRobots.allowed("User-agent: *\nDisallow:\nUser-agent: Googlebot\nDisallow: /", "/product")).isTrue();
        assertThat(CashRobots.allowed("User-agent: *\nDisallow: /\nAllow: /products/", "/products/a")).isTrue();
        assertThat(CashRobots.allowed("User-agent: *\nAllow: /\nUser-agent: FlexableWebCatalog\nDisallow: /", "/product")).isFalse();
        assertThat(CashRobots.allowed("User-agent: *\nDisallow: /products/*?secret=$", "/products/a?secret=")).isFalse();
    }
    static String kbank() { return """
        <title>플러스박스 | 합성 테스트</title><p>다른 상품 99%</p><p>조회기준일: 2026.10.30 현재</p>
        <table><caption>적용금리 금액구간, 금리안내</caption><thead><tr><th>금액구간</th><th>금리</th></tr></thead>
        <tbody><tr><td>5천만원 이하</td><td>1.23%</td></tr><tr><td>5천만원 초과분</td><td>2.34%</td></tr></tbody></table>
        <ul><li>가입대상: 개인</li><li>가입금액: 제한없음</li><li>적용금리: 구간별 적용</li>
        <li>이자계산방법: 일별 잔액의 구간별 금리</li><li>이자결산지급일: 매월 정산</li>
        <li>「바로 이자받기」: 신청 시 지급</li></ul><p>이 예금은 예금자보호법에 따라 보호</p>
        """; }
    static String eugene() { return """
        <div class="cma_benefit"><div>CMA-RP수익률 (2026 . 10 . 31 기준)</div><div><table>
        <caption>CMA - RP 수익률 정보 제공</caption><tbody>
        <tr><th>자유형 CMA</th><td>-</td><td>2.10%</td><td>-</td></tr>
        <tr><th rowspan="2">자산관리형 CMA</th><td>1일 ~ 15일</td><td>2.20%</td><td rowspan="2">30일 뒤 재투자</td></tr>
        <tr><td>16일 ~ 30일</td><td>2.30%</td></tr>
        <tr><th>법인 CMA</th><td>-</td><td>99%</td><td>-</td></tr></tbody></table></div>
        <ul><li>- 가입대상 : 개인 및 법인</li><li>- 한도금액 : 상품별 조건</li><li>- 자동투자 : 당일 매수</li></ul></div>
        """; }
    static String fsb() { return """
        <table id="apdTbl"><thead><tr><th>저축은행</th><th>상품</th><th>기본</th><th>최고</th><th>금액</th><th>비교공시일</th></tr></thead>
        <tbody><tr><td>가</td><td>보통예금</td><td>0.10%</td><td>3.20%</td><td>100만원 이하</td><td>20261030</td></tr>
        <tr><td>나저축은행</td><td>보통예금</td><td>2.00%</td><td>2.00%</td><td>제한없음</td><td>20261101</td></tr></tbody></table>
        """; }
    static String mirae() { return """
        <table><caption>일반 RP</caption><tbody><tr><td>개인</td><td>수시 RP</td><td>99%</td></tr></tbody></table>
        <table><caption>CMA</caption><tbody><tr><td>개인</td><td>CMA RP_개인</td><td>조건</td><td>연 1.23%</td></tr>
        <tr><td>법인</td><td>CMA RP_법인</td><td>조건</td><td>99%</td></tr></tbody></table>
        """; }
}
