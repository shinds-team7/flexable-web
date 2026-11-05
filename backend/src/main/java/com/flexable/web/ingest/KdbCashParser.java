package com.flexable.web.ingest;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.LinkedHashSet;
import java.util.List;
import java.util.Set;
import org.jsoup.Jsoup;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/** 개인뱅킹의 개인·입출금 분류 전체와 상품별 상세/현재 금리만 사용한다. */
final class KdbCashParser {
    record Candidate(String id, String rateId, String name) {}
    record Page(int total, List<Candidate> items) {}
    private static final Set<String> COLS = Set.of("가입금액", "적용이율", "이자계산방법", "이자지급시기", "입금제한",
        "거래제한", "거래방법", "해지방법", "원금 및 이자지급제한", "부가혜택", "부가혜택 (수수료면제)",
        "세제혜택", "추가이율 이벤트", "추가이율 이벤트 금리 적용기간 및 이자지급일", "추가이율 이벤트 유의사항");

    static String catalogRequest(int page) {
        if (page < 1 || page > 100) throw changed();
        return "{\"CTG_N1_SNO\":[{\"value\":\"1010300\"}],\"PRD_JIN_TGT_C\":[{\"value\":\"10\"}],"
            + "\"XPO_TGT_C\":[{\"value\":20}],\"WEB_PRD_CLSF_C\":10,\"ORD\":\"\",\"WGD_NM\":\"\","
            + "\"HEADER_STD_WEB\":{\"REQ_PAGE_NO\":" + page + ",\"PAGE_ROW_COUNT\":10,\"NEXT_PAGE_YN\":\""
            + (page == 1 ? "S" : "M") + "\",\"NEXTPAGDTT\":\"P\",\"GRID_NEXTKEY_ITR_CND\":\"\"}}";
    }

    static Page catalog(String json, int page) {
        var root = root(json); var header = root.path("HEADER_STD_WEB"); var rows = root.path("GRID_LIST");
        int total = header.path("TOT_PAG_ROW_CNT").asInt(-1), pages = (total + 9) / 10;
        if (total < 1 || total > 1000 || page < 1 || page > pages || !rows.isArray()
            || header.path("REQ_PAGE_NO").asInt() != page || header.path("PAGE_ROW_COUNT").asInt() != 10
            || header.path("TOT_PAG_CNT").asInt() != pages
            || !header.path("NEXT_PAGE_YN").asText().equals(page < pages ? "Y" : "N")
            || rows.size() != Math.min(10, total - (page - 1) * 10)) throw changed();
        var result = new ArrayList<Candidate>(); var ids = new HashSet<String>();
        for (var row : rows) {
            String id = row.path("PRD_C").asText(), rateId = row.path("PRD_IRT_C").asText(), name = row.path("WGD_NM").asText();
            if (!id.matches("[0-9]{12}") || !rateId.matches("[0-9]{12}") || name.isBlank() || !ids.add(id)
                || !row.path("CTG_N1_NM").asText().equals("입출금자유상품")
                || !row.path("PRD_JIN_TGT_C").asText().equals("10")
                || !row.path("WEB_PRD_CLSF_C").asText().equals("10") || !row.path("SLE_YN").asText().equals("Y")) throw changed();
            result.add(new Candidate(id, rateId, name));
        }
        return new Page(total, List.copyOf(result));
    }

    static Product detail(Candidate candidate, String json, String rateJson, OffsetDateTime at) {
        var root = root(json); var b = root.path("BSC_DATA"); var d = root.path("DET_DATA"); var rates = root(rateJson);
        if (!b.path("PRD_C").asText().equals(candidate.id()) || !d.path("PRD_C").asText().equals(candidate.id())
            || !b.path("WGD_NM").asText().equals(candidate.name()) || !b.path("PRD_IRT_C").asText().equals(candidate.rateId())
            || !b.path("WEB_PRD_CLSF_C").asText().equals("10") || !b.path("SLE_YN").asText().equals("Y")
            || !root.path("COL_LIST").isArray() || root.path("COL_LIST").isEmpty()) throw changed();
        var conditions = new LinkedHashSet<String>();
        add(conditions, "가입대상", d.path("PRD_JIN_TGT_DES"));
        add(conditions, "가입방법", d.path("JIN_MANR_DES"));
        add(conditions, "가입금액", d.path("JIN_AMT_OTL"));
        add(conditions, "상품설명", d.path("PRD_DES"));
        if (text(d.path("PRD_JIN_TGT_DES")).isBlank() || text(d.path("JIN_MANR_DES")).isBlank()) throw changed();
        String payment = null;
        for (var col : root.path("COL_LIST")) {
            if (!col.path("PRD_C").asText().equals(candidate.id())) throw changed();
            String name = col.path("PRD_COL_NM").asText(), value = text(col.path("PRD_COL_DES_INF"));
            if (COLS.contains(name) && !value.isBlank()) conditions.add(name + ": " + value);
            if (name.equals("이자지급시기") && !value.isBlank()) {
                if (payment != null) throw changed();
                payment = value;
            }
        }
        if (payment == null) throw changed();
        LocalDate asOf = date(rates.path("BSE_DT").asText());
        var rows = rates.path("IRT_LIST");
        if (!rows.isArray() || rows.isEmpty()) throw changed();
        BigDecimal uniform = null; boolean same = true;
        for (var row : rows) {
            // HI_FIVE_LIST는 다른 상품 추천 목록이다. 금리·상품 조건에 섞지 않는다.
            // 목록의 조회용 금리 코드와 현재 표시되는 세부 금리 코드는 다를 수 있다.
            // 연결의 정본은 IRT_LIST의 해당 상품 코드이며 추천 목록은 사용하지 않는다.
            if (!row.path("PRD_C").asText().equals(candidate.id()) || !row.path("PRD_IRT_C").asText().matches("[0-9]{12}"))
                throw new IllegalStateException("KDB 금리 상품 코드 불일치");
            if (!date(row.path("BSE_DT").asText()).equals(asOf)) throw new IllegalStateException("KDB 금리 기준일 불일치");
            if (!row.path("DEL_YN").asText().equals("N") || !row.path("OPB_YN").asText().equals("Y"))
                throw new IllegalStateException("KDB 현재 공개 금리 확인 실패");
            String number = row.path("AVR_ITSR").asText();
            if (!number.matches("[0-9]{1,2}(\\.[0-9]{1,4})?")) throw changed();
            var rate = new BigDecimal(number);
            if (rate.compareTo(BigDecimal.valueOf(100)) >= 0) throw changed();
            if (uniform == null) uniform = rate; else if (uniform.compareTo(rate) != 0) same = false;
            String tier = text(row.path("MNG_PRD_IRT_STG_NM1"));
            String second = text(row.path("MNG_PRD_IRT_STG_NM2"));
            conditions.add("공시 금리: " + text(row.path("MNG_ITSR_GRP_NM")) + " / " + tier
                + (second.isBlank() ? "" : " / " + second) + " / 연 " + number + "% (세전)");
            add(conditions, "금리 조건", row.path("PRD_DES"));
        }
        return new Product(candidate.id(), "한국산업은행", candidate.name(), "BANK", null, same ? uniform : null,
            null, "VARIABLE_DEPOSIT", String.join("\n", conditions), payment, null,
            switch (b.path("DPW_PRT_TGT_PRD_YN").asText()) { case "Y" -> true; case "N" -> false; default -> null; },
            null, null, "KDB산업은행 개인뱅킹 입출금자유상품 공시", OfficialCashClient.Source.KDB.url, asOf, null, at);
    }
    private static JsonNode root(String json) {
        var root = JsonMapper.builder().build().readTree(json);
        if (!root.path("COMMON_HEAD").path("ERROR").isBoolean() || root.path("COMMON_HEAD").path("ERROR").asBoolean()) throw changed();
        return root;
    }
    private static void add(Set<String> conditions, String label, JsonNode node) {
        String value = text(node); if (!value.isBlank()) conditions.add(label + ": " + value);
    }
    private static String text(JsonNode node) {
        return Jsoup.parse(node.asText("").replace("||", "\n")).wholeText().strip().replaceAll("[\\t\\r ]+", " ");
    }
    private static LocalDate date(String value) {
        if (!value.matches("20[0-9]{6}")) throw changed();
        return LocalDate.parse(value, DateTimeFormatter.BASIC_ISO_DATE);
    }
    private static IllegalStateException changed() { return new IllegalStateException("KDB 개인 입출금 전체 목록·상세·금리 확인 실패"); }
}
