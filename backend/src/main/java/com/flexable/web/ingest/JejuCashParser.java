package com.flexable.web.ingest;

import java.math.BigDecimal;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import tools.jackson.databind.json.JsonMapper;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/** 공식 전체 목록과 각 상품의 공개 상세를 대조한다. */
final class JejuCashParser {
    record Candidate(String id, String name) {}
    private static final Pattern RATE = Pattern.compile("(?:연\\s*)?(\\d+(?:\\.\\d+)?)\\s*%");
    private static final Set<String> FIELDS = Set.of("상품특징", "예금종류", "가입대상", "가입금액", "가입기간", "거래방법", "원금/이자지급방법",
        "기본금리", "최고금리", "우대금리", "우대이자율", "우대서비스", "이자계산방법", "이자지급방법", "이자지급시기", "이벤트우대금리");

    static List<Candidate> catalog(String json) {
        var root = JsonMapper.builder().build().readTree(json);
        var rows = root.path("data");
        if (!rows.isArray() || rows.isEmpty() || rows.size() != root.path("itemsCount").asInt()
                || !root.path("DepositeVO").path("typCdVal").asText().equals("02")) throw changed();
        var ids = new HashSet<String>(); var result = new ArrayList<Candidate>();
        for (var row : rows) {
            String id = row.path("prdId").asText(), name = row.path("prdNm").asText();
            String target = row.path("joingTrgtDesc").asText("");
            if (!id.matches("SID_[a-f0-9]{32}") || name.isBlank() || !ids.add(id)) throw changed();
            if (name.matches(".*(법인|기업|사업자|사장님).*")) continue;
            if (target.contains("법인") && !target.contains("실명의 개인") && !target.contains("개인 및")) continue;
            result.add(new Candidate(id, name));
        }
        if (result.isEmpty()) throw changed();
        return List.copyOf(result);
    }
    static Product detail(Candidate candidate, String html, OffsetDateTime at) {
        Document doc = Jsoup.parse(html);
        if (doc.getAllElements().stream().noneMatch(e -> e.ownText().strip().equals(candidate.name()))) throw changed();
        var conditions = new java.util.LinkedHashSet<String>(); String payment = null, timing = null;
        for (var dl : doc.select("dl.text-row-item")) {
            String name = dl.select("dt").text().replaceAll("\\s+", "");
            String text = dl.select("dd").stream().map(e -> e.wholeText().strip().replaceAll("[\\t\\r ]+", " ").replaceAll("\\n\\s*\\n+", "\n"))
                .filter(t -> !t.isBlank()).collect(java.util.stream.Collectors.joining("\n"));
            // 이벤트가 없는 상품도 날짜 없는 빈 안내 틀("이벤트기간 : ~")이 붙어 있어 조건으로 쓰지 않는다
            boolean emptyEventTemplate = name.equals("이벤트우대금리") && text.contains("이벤트기간 : ~");
            if (FIELDS.contains(name) && !text.isBlank() && !emptyEventTemplate) conditions.add(name + ": " + text);
            if (name.equals("원금/이자지급방법") && !text.isBlank()) payment = text;
            if (name.equals("이자지급시기") && !text.isBlank()) timing = text;
        }
        if (conditions.isEmpty()) throw changed();
        BigDecimal base = card(doc, "기본금리"), max = card(doc, "최고금리");
        if (base == null) {
            var rates = new ArrayList<BigDecimal>();
            for (var cell : doc.select("#bsicIntrVal td")) {
                var m = RATE.matcher(cell.text().strip()); if (m.matches()) rates.add(new BigDecimal(m.group(1)));
            }
            if (!rates.isEmpty() && rates.stream().allMatch(r -> r.compareTo(rates.getFirst()) == 0)) base = rates.getFirst();
        }
        for (var card : doc.select("div.card3")) {
            String heading = card.select("h4.tit").text();
            if (heading.equals("기본금리") || heading.equals("최고금리")) conditions.add(heading + " 공시 조건: " + card.select("p.txt").text());
        }
        return new Product(candidate.id(), "제주은행", candidate.name(), "BANK", null, base, max, "VARIABLE_DEPOSIT",
            String.join("\n", conditions), payment != null ? payment : timing, null, doc.text().contains("이 예금은 예금자보호법에 따라") ? Boolean.TRUE : null,
            null, null, "제주은행 공식 입출금 상품 안내",
            detailPath(candidate.id()), null, null, at);
    }
    static String detailPath(String id) {
        if (!id.matches("SID_[a-f0-9]{32}")) throw changed();
        return "https://www.jejubank.co.kr/hmpg/prdGdnc/sid/mndp.do?mode=detail&prdId=" + id;
    }
    private static BigDecimal card(Document doc, String label) {
        var cards = doc.select("div.card3").stream().filter(c -> c.select("h4.tit").text().equals(label)).toList();
        if (cards.size() > 1) throw changed();
        if (cards.isEmpty()) return null;
        var m = RATE.matcher(cards.getFirst().select("p.txt").text());
        if (!m.find()) throw changed();
        return new BigDecimal(m.group(1));
    }
    private static IllegalStateException changed() { return new IllegalStateException("제주은행 전체 목록·상세 필수 항목 확인 실패"); }
}
