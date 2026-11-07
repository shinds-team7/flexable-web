package com.flexable.web.ingest;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.ArrayList;
import java.util.List;
import java.util.regex.Pattern;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Document;
import org.jsoup.nodes.Element;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/** 상품 표의 의미·구조를 검증한다. 사이트 전체에서 첫 %를 고르지 않는다. */
final class OfficialCashParser {
    private static final Pattern RATE = Pattern.compile("(?:연\\s*)?(\\d+(?:\\.\\d+)?)\\s*%");
    private static final Pattern DATE = Pattern.compile("(20\\d{2})\\s*\\.\\s*(\\d{1,2})\\s*\\.\\s*(\\d{1,2})");

    static List<Product> fsbExport(String html, OffsetDateTime at) {
        Document doc = Jsoup.parse(html);
        Element table = doc.selectFirst("table#apdTbl");
        if (table == null || !table.select("thead").text().contains("비교공시일")) throw changed();
        List<Product> result = new ArrayList<>();
        for (Element row : table.select("tbody > tr")) {
            var c = row.select(":scope > td");
            if (c.size() != 6) throw changed();
            String company = c.get(0).text(), name = c.get(1).text(), band = c.get(4).text();
            if (company.isBlank() || name.isBlank() || band.isBlank()) throw changed();
            LocalDate asOf = LocalDate.parse(c.get(5).text(), java.time.format.DateTimeFormatter.BASIC_ISO_DATE);
            String condition = "최고금리 적용 가능 금액: " + band
                + "\n우대조건·초과분 금리·가입대상·지급방식은 이 요약 파일에 없으므로 상세 공시에서 확인해야 해요. 최고금리를 전체 잔액에 적용하지 않아요.";
            result.add(new Product(company + ":" + name, company.endsWith("저축은행") ? company : company + "저축은행",
                name, "SAVINGS_BANK", null, rate(c.get(2).text()), rate(c.get(3).text()), "VARIABLE_DEPOSIT",
                condition, null, null, null, null, null, "저축은행중앙회 입출금자유예금 전체 공시",
                OfficialCashClient.Source.FSB.url, asOf, null, at));
        }
        if (result.isEmpty()) throw changed();
        if (result.stream().map(Product::id).distinct().count() != result.size()) throw changed();
        return List.copyOf(result);
    }

    static List<Product> miraeRp(String html, OffsetDateTime at) {
        Document doc = Jsoup.parse(html);
        var tables = doc.select("table").stream().filter(t -> t.select("caption").text().equals("CMA")).toList();
        if (tables.size() != 1) throw changed();
        var rows = tables.getFirst().select("tbody tr").stream()
            .filter(r -> r.text().contains("CMA RP_개인")).toList();
        if (rows.size() != 1) throw changed();
        var c = rows.getFirst().select("td");
        if (c.size() != 4 || !c.getFirst().text().equals("개인")) throw changed();
        BigDecimal r = rate(c.getLast().text());
        return List.of(new Product("cma-rp-personal", "미래에셋증권", "CMA RP_개인", "SECURITIES", "RP", r, r, "AGREED",
            "개인용 CMA RP 공시. 일반 수시형·약정형 RP 및 법인 상품과 구분해요. 네이버통장 등 별도 제휴 조건은 포함하지 않아요.",
            null, null, null, null, null, "미래에셋증권 RP 상품 안내", OfficialCashClient.Source.MIRAE_RP.url, null, null, at));
    }

    /** 교보 PLUS α CMA(RP형) 안내의 "CMA용 수시 입출금식 RP 수익률 : 연 N% (기준일 기준, 세전)" 한 줄을 읽는다. */
    static List<Product> kyobo(String html, OffsetDateTime at) {
        Document doc = Jsoup.parse(html);
        if (!doc.title().contains("교보 PLUS")) throw changed();
        var lines = doc.select("dt").stream().filter(d -> d.text().startsWith("CMA용 수시 입출금식 RP 수익률")).toList();
        if (lines.size() != 1) throw changed();
        var m = Pattern.compile("CMA용 수시 입출금식 RP 수익률\\s*:\\s*(연\\s*\\d+(?:\\.\\d+)?\\s*%)\\s*\\((20\\d{2}\\s*\\.\\s*\\d{1,2}\\s*\\.\\s*\\d{1,2})\\s*기준,\\s*세전\\)")
            .matcher(lines.getFirst().text());
        if (!m.matches()) throw changed();
        String all = doc.text();
        if (!all.contains("예금자보호법에 따라 보호되지 않습니다") || !all.contains("90일")) throw changed();
        BigDecimal r = rate(m.group(1));
        return List.of(new Product("plus-alpha-cma-rp", "교보증권", "교보 PLUS α CMA(RP형)", "SECURITIES", "RP", r, r, "AGREED",
            "CMA용 수시 입출금식 RP 약정수익률(세전). 입금 시점의 약정수익률을 90일간 적용하고, 90일이 지나면 그 시점의 공시수익률로 바뀌어요. 시장금리에 따라 변동될 수 있어요.",
            null, "원금과 이자를 재투자하거나 원천징수하려면 매도 후 재매수해야 해요.", Boolean.FALSE, null, null,
            "교보증권 PLUS α CMA 안내", OfficialCashClient.Source.KYOBO.url, date(m.group(2)), null, at));
    }

    static List<Product> kbank(String html, OffsetDateTime at) {
        Document doc = Jsoup.parse(html);
        if (!doc.title().contains("플러스박스")) throw changed();
        Element table = oneTable(doc, "금액구간");
        List<Element> rows = table.select("tbody tr");
        if (rows.size() != 2) throw changed();
        List<BigDecimal> rates = new ArrayList<>();
        List<String> tiers = new ArrayList<>();
        for (Element row : rows) {
            var cells = row.select("th,td");
            if (cells.size() != 2 || !cells.getFirst().text().contains("만원")) throw changed();
            rates.add(rate(cells.get(1).text()));
            tiers.add(cells.getFirst().text() + " : " + cells.get(1).text());
        }
        if (!rows.getFirst().text().contains("이하") || !rows.getLast().text().contains("초과분")) throw changed();
        String conditions = String.join("\n", tiers) + "\n" + bullets(doc, "가입대상:", "가입금액:", "적용금리:", "이자계산방법:", "이벤트 등을 통해");
        String payment = bullet(doc, "이자결산지급일:");
        String reinvestment = bullet(doc, "「바로 이자받기」:");
        var date = Pattern.compile("조회기준일\\s*:\\s*(20\\d{2}\\s*\\.\\s*\\d{1,2}\\s*\\.\\s*\\d{1,2})").matcher(doc.text());
        if (!date.find() || payment == null || !conditions.contains("구간별")) throw changed();
        return List.of(new Product("plusbox", "케이뱅크", "플러스박스", "BANK", null,
                rates.getFirst(), rates.stream().max(BigDecimal::compareTo).orElseThrow(), "VARIABLE_DEPOSIT",
                conditions, payment, reinvestment, protectedDeposit(doc), null, null,
                "케이뱅크 공식 상품 안내", OfficialCashClient.Source.KBANK.url, date(date.group(1)), null, at));
    }

    static List<Product> eugene(String html, OffsetDateTime at) {
        Document doc = Jsoup.parse(html);
        Element table = oneTable(doc, "CMA - RP 수익률");
        Element title = table.parent().previousElementSibling();
        if (title == null || !title.text().contains("CMA-RP수익률")) throw changed();
        LocalDate asOf = date(title.text());
        Element section = table.closest(".cma_benefit");
        if (section == null) throw changed();
        String terms = bullets(section, "- 가입대상", "- 한도금액", "- 자동투자");
        if (terms.isBlank()) throw changed();
        Element free = null, managed = null;
        for (Element row : table.select("tr")) {
            if (row.select("th").stream().anyMatch(th -> th.text().equals("자유형 CMA"))) free = row;
            if (row.select("th").stream().anyMatch(th -> th.text().equals("자산관리형 CMA"))) managed = row;
        }
        if (free == null || managed == null || free.select("td").size() != 3 || managed.select("td").size() != 3) throw changed();
        BigDecimal freeRate = rate(free.select("td").get(1).text());
        List<BigDecimal> rates = new ArrayList<>();
        List<String> tiers = new ArrayList<>();
        Element row = managed;
        do {
            var cells = row.select("td");
            if (cells.size() < 2 || !cells.getFirst().text().contains("일")) throw changed();
            rates.add(rate(cells.get(1).text()));
            tiers.add(cells.getFirst().text() + " : " + cells.get(1).text());
            row = row.nextElementSibling();
        } while (row != null && row.select("th").isEmpty());
        String reinvestment = managed.select("td").get(2).text();
        if (rates.isEmpty() || !reinvestment.contains("재투자")) throw changed();
        return List.of(cma("free-rp", "챔피언CMA 자유형", freeRate, freeRate,
                "자유형 CMA · " + terms, null, asOf, at),
                cma("managed-rp", "챔피언CMA 자산관리형", rates.getFirst(), rates.stream().max(BigDecimal::compareTo).orElseThrow(),
                    String.join("\n", tiers) + "\n" + terms, reinvestment, asOf, at));
    }

    private static Product cma(String id, String name, BigDecimal base, BigDecimal max, String terms,
            String reinvestment, LocalDate asOf, OffsetDateTime at) {
        return new Product(id, "유진투자증권", name, "SECURITIES", "RP", base, max, "AGREED", terms,
                null, reinvestment, null, null, null, "유진투자증권 공식 CMA 안내",
                OfficialCashClient.Source.EUGENE.url, asOf, null, at);
    }
    private static Boolean protectedDeposit(Document doc) {
        return doc.text().contains("이 예금은 예금자보호법에 따라") ? Boolean.TRUE : null;
    }
    private static Element oneTable(Document doc, String caption) {
        var matches = doc.select("table").stream().filter(t -> t.select("caption").text().contains(caption)).toList();
        if (matches.size() != 1) throw changed();
        return matches.getFirst();
    }
    private static BigDecimal rate(String text) {
        var m = RATE.matcher(text.strip());
        if (!m.matches()) throw changed();
        BigDecimal result = new BigDecimal(m.group(1));
        return result;
    }
    private static LocalDate date(String text) {
        var m = DATE.matcher(text);
        if (!m.find()) throw changed();
        return LocalDate.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
    }
    private static String bullet(Element scope, String prefix) {
        return scope.select("li").stream().map(Element::text).filter(t -> t.startsWith(prefix)).findFirst().orElse(null);
    }
    private static String bullets(Element scope, String... prefixes) {
        List<String> lines = new ArrayList<>();
        for (String prefix : prefixes) { String line = bullet(scope, prefix); if (line != null) lines.add(line); }
        return String.join("\n", lines);
    }
    private static IllegalStateException changed() { return new IllegalStateException("공식 상품 표 구조·필수 조건을 확인할 수 없습니다"); }
}
