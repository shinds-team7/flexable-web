package com.flexable.web.ingest;

import static org.assertj.core.api.Assertions.*;
import java.time.OffsetDateTime;
import org.junit.jupiter.api.Test;

class JejuCashParserTest {
    private static final String ID = "SID_" + "a".repeat(32);
    private static final String CATALOG = """
        {"itemsCount":2,"DepositeVO":{"typCdVal":"02"},"data":[
          {"prdId":"SID_aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa","prdNm":"합성 파킹통장","joingTrgtDesc":"실명의 개인"},
          {"prdId":"SID_bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb","prdNm":"사업자통장","joingTrgtDesc":"개인사업자"}]}
        """;
    @Test void validatesWholeCatalogAndKeepsCardAmountConditions() {
        var candidates = JejuCashParser.catalog(CATALOG);
        assertThat(candidates).containsExactly(new JejuCashParser.Candidate(ID, "합성 파킹통장"));
        var product = JejuCashParser.detail(candidates.getFirst(), """
            <h1>합성 파킹통장</h1><p>다른 상품 연 99%</p>
            <div class="card3"><h4 class="tit">기본금리</h4><p class="txt">연 0.10%(5백만원 이하, 세전)</p></div>
            <div class="card3"><h4 class="tit">최고금리</h4><p class="txt">연 2.34%(우대 조건 충족 시)</p></div>
            <dl class="text-row-item"><dt>가입대상</dt><dd>실명의 개인</dd></dl>
            <dl class="text-row-item"><dt>원금/이자지급방법</dt><dd>매월 결산</dd></dl>
            """, OffsetDateTime.parse("2026-11-04T10:00:00+09:00"));
        assertThat(product.baseRate()).isEqualByComparingTo("0.10");
        assertThat(product.maxRate()).isEqualByComparingTo("2.34");
        assertThat(product.conditions()).contains("5백만원 이하", "우대 조건 충족", "실명의 개인");
        assertThat(product.interestPayment()).isEqualTo("매월 결산");
        assertThat(product.sourceAsOf()).isNull();
        assertThatThrownBy(() -> JejuCashParser.catalog(CATALOG.replace("\"itemsCount\":2", "\"itemsCount\":3")))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> JejuCashParser.catalog(CATALOG.replace("b".repeat(32), "a".repeat(32))))
            .isInstanceOf(IllegalStateException.class);
        assertThatThrownBy(() -> JejuCashParser.detail(candidates.getFirst(), "<h1>다른 상품</h1>", product.verifiedAt()))
            .isInstanceOf(IllegalStateException.class);
    }
}
