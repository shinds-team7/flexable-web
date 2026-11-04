package com.flexable.web.ingest;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.HashSet;
import java.util.List;
import java.util.Map;
import org.jsoup.Jsoup;
import org.jsoup.nodes.Element;
import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

/** 공개 화면이 실제로 사용하는 조회 항목만 읽는다. 응답 원문·고객/담당자 정보는 저장하지 않는다. */
final class OfficialCashJsonParser {
    private static final JsonMapper JSON = JsonMapper.builder().build();
    private static final Map<String, String> PAYMENT = Map.of("1", "수시지급", "2", "월지급", "3", "분기지급", "4", "반기지급", "5", "연지급", "6", "기타");
    private static final Map<String, String> RANGE = Map.of("1", "이상", "2", "이하", "3", "초과", "4", "미만", "5", "제한없음");
    private static final Map<String, String> CHANNEL = Map.of("1", "영업점", "2", "인터넷", "3", "스마트폰", "4", "모집인", "5", "전화(텔레뱅킹)", "9", "기타");

    static List<Product> fsb(String json, OffsetDateTime at) {
        var root = JSON.readTree(json);
        var rows = root.path("ANYM_REC");
        int total = Integer.parseInt(required(root, "TOTAL_CNT"));
        if (!rows.isArray() || total <= 0 || rows.size() != total) throw changed("전체 건수");
        var products = new ArrayList<Product>();
        var ids = new HashSet<String>();
        for (var row : rows) {
            if (Integer.parseInt(required(row, "CNT")) != total) throw changed("행별 전체 건수");
            String id = required(row, "FINAN_COMP_CODE") + ":" + required(row, "FINAN_PROD_CODE");
            if (!ids.add(id)) throw changed("중복 상품");
            String company = required(row, "BANK_NAME"), name = required(row, "PRODUCT_NAME");
            String amount = required(row, "HGST_INTR_APL_AMT"), range = decode(required(row, "RNG_CODE"), RANGE);
            // '이상/초과'는 상한이 아니다. 구간 방향을 보존하고 단일 한도로 축약하지 않는다.
            String band = range.equals("제한없음") ? range : amount + " " + range;
            String conditions = "최고금리 적용 가능 금액(공시값): " + band + "\n우대조건: " + plain(row, "SWEETENER")
                + "\n가입대상: " + plain(row, "JOIN_TARGET") + "\n가입경로: " + decode(required(row, "JOIN_LOCATION"), CHANNEL)
                + "\n기타사항: " + plain(row, "ETC_NOTE_MATTER") + "\n구간별·우대조건을 확인해야 하며 최고금리를 전체 잔액에 적용하지 않아요.";
            products.add(new Product(id, company.endsWith("저축은행") ? company : company + "저축은행", name,
                "SAVINGS_BANK", null, decimal(required(row, "RATE_LOW")), decimal(required(row, "RATE_HIGH")), "VARIABLE_DEPOSIT",
                conditions, decode(required(row, "DEPO_INTS_PRVS_MTHD_CD"), PAYMENT), null, null, null, null,
                "저축은행중앙회 입출금자유예금 전체 공시", OfficialCashClient.Source.FSB.url,
                basic(required(row, "START_DATE")), null, at));
        }
        return List.copyOf(products);
    }

    static List<Product> samsung(String html, String rpJson, String noteJson, OffsetDateTime at) {
        var doc = Jsoup.parse(html);
        var rp = JSON.readTree(rpJson);
        var note = JSON.readTree(noteJson);
        noError(rp); noError(note);
        var rpData = rp.path("result").path("outRec1");
        var notes = note.path("result").path("outRec2");
        if (!notes.isArray()) throw changed("발행어음 목록");
        JsonNode cmaNote = null;
        for (var row : notes) if (required(row, "shrt_BILL_PRDT_SECT_CODE").equals("5")) {
            if (cmaNote != null || !required(row, "prdt_NAME").equals("CMA")) throw changed("CMA 발행어음 구분");
            cmaNote = row;
        }
        if (cmaNote == null) throw changed("CMA 발행어음 누락");
        var result = new ArrayList<Product>();
        for (String category : List.of("RP", "PROMISSORY_NOTE")) {
            String name = category.equals("RP") ? "CMA RP형" : "CMA 발행어음형";
            var tables = doc.select("table").stream().filter(t -> t.select("caption").stream().anyMatch(c -> c.ownText().strip().equals(name))).toList();
            if (tables.size() != 1) throw changed("삼성 CMA 조건 표");
            var table = tables.getFirst();
            String reinvestment = cell(table, "재투자");
            String terms = "자동매수: " + cell(table, "자동매수") + "\n재투자: " + reinvestment + "\n수수료: " + cell(table, "수수료")
                + "\n자동매수 가능 시간대: " + cell(table, "자동매수가능시간대") + "\n공시 약정수익률이며 특판·일반 약정식 발행어음과 구분해요.";
            BigDecimal rate = category.equals("RP") ? decimal(required(rpData, "A_NDVL_RP_ANCT_YILD")) : decimal(required(cmaNote, "frst_SHRT_BILL_ANCT_YILD"));
            LocalDate date = basic(category.equals("RP") ? required(rpData, "ANCT_DATE") : required(note.path("result").path("outRec1"), "BSNS_DATE"));
            result.add(cma("samsung-" + category.toLowerCase(java.util.Locale.ROOT), "삼성증권", name, category, rate, rate, terms,
                reinvestment, date, OfficialCashClient.Source.SAMSUNG, at));
        }
        return List.copyOf(result);
    }

    static List<Product> kbankOther(String json, OffsetDateTime at) {
        var root = JSON.readTree(json).path("_msg_");
        if (!required(root.path("_common_"), "resCode").equals("00") || !required(root.path("_common_"), "error.code").equals("F0000")) throw changed("케이뱅크 조회 상태");
        var body = root.path("_body_");
        if (!required(body, "inqryType").equals("SALE")) throw changed("판매 중 상품 구분");
        var rows = body.path("pdInfoList10");
        if (!rows.isArray() || rows.isEmpty()) throw changed("케이뱅크 입출금 목록");
        var products = new ArrayList<Product>(); var ids = new HashSet<String>();
        for (var row : rows) {
            String id = required(row, "pdCd"), name = unquote(required(row, "pdNm"));
            if (!ids.add(id)) throw changed("케이뱅크 중복 상품");
            // 플러스박스는 상세 조건을 제공하는 기존 출처가 담당한다.
            if (name.equals("플러스박스") || name.contains("사장님") || name.contains("법인") || name.contains("사업자")) continue;
            var rates = new ArrayList<BigDecimal>(); var terms = new ArrayList<String>();
            BigDecimal base = null;
            for (var type : List.of("typeList1", "typeList4", "typeList5")) {
                var bands = row.path(type);
                if (!bands.isArray()) throw changed("케이뱅크 금리 구분");
                for (var band : bands) {
                    BigDecimal rate = decimal(required(band, "rate")); rates.add(rate);
                    if (type.equals("typeList1") && base == null) base = rate;
                    String label = type.equals("typeList1") ? "일반·기본금리" : type.equals("typeList4") ? "생활금리" : "모임 금리 조건 충족 시";
                    String amount = unquote(band.path("amtStcn").asText(""));
                    terms.add(label + " " + amount + ": " + rate + "%");
                }
            }
            if (base == null) throw changed("케이뱅크 기본금리");
            products.add(new Product(id, "케이뱅크", name, "BANK", null, base, rates.stream().max(BigDecimal::compareTo).orElseThrow(), "VARIABLE_DEPOSIT",
                String.join("\n", terms) + "\n판매 중 입출금 상품 금리 공시예요. 가입대상·지급방식·우대조건의 세부 요건은 상품 안내를 확인해 주세요. 최고금리를 전체 잔액에 적용하지 않아요.",
                null, null, null, null, null, "케이뱅크 판매 중 입출금 금리 안내", OfficialCashClient.Source.KBANK_OTHER.url,
                basic(required(body, "inqryBaseDt")), null, at));
        }
        if (products.isEmpty()) throw changed("케이뱅크 개인 입출금 상품");
        return List.copyOf(products);
    }

    static List<Product> sc(String rateJson, String catalogJson, OffsetDateTime at) {
        var catalog = JSON.readTree(catalogJson).path("vector");
        var rows = JSON.readTree(rateJson).path("vector");
        if (!catalog.isArray() || catalog.isEmpty() || !rows.isArray() || rows.isEmpty()) throw changed("SC 전체 목록");
        var names = new java.util.LinkedHashMap<String, String>();
        var grouped = new java.util.LinkedHashMap<String, List<JsonNode>>();
        for (var item : catalog) {
            var row = item.path("OUTPUT");
            if (names.putIfAbsent(required(row, "PRDCT_ID"), required(row, "PRDCT_NM")) != null) throw changed("SC 중복 상품");
        }
        for (var item : rows) {
            var row = item.path("OUTPUT");
            String id = required(row, "PRDCT_ID");
            if (!names.containsKey(id) || !required(row, "INT_RATE_TYPE").equals("입출금자유")) throw changed("SC 상품 구분");
            grouped.computeIfAbsent(id, ignored -> new ArrayList<>()).add(row);
        }
        if (!names.keySet().equals(grouped.keySet())) throw changed("SC 전체 상품 대조");
        var products = new ArrayList<Product>();
        for (var entry : grouped.entrySet()) {
            String name = names.get(entry.getKey());
            if (name.matches(".*(기업|법인|비즈|사업자).*$")) continue;
            var terms = new java.util.LinkedHashSet<String>(); var basics = new ArrayList<BigDecimal>();
            var effectiveDates = new java.util.HashSet<LocalDate>();
            for (var row : entry.getValue()) {
                String band = required(row, "INT_RATE_TTL"), channel = required(row, "ENTRNC_TYPE");
                BigDecimal rate = decimal(required(row, "DFLT_INT_RATE"));
                if (band.contains("기본이율") || band.contains("기본금리")) basics.add(rate);
                LocalDate effective = LocalDate.parse(required(row, "INT_EFFCTV_DT"));
                if (effective.isAfter(at.toLocalDate())) throw changed("SC 미래 적용 금리");
                effectiveDates.add(effective);
                terms.add(channel + " · " + band + ": " + rate + "% (적용일 " + effective + ") · " + plain(row, "RMK"));
                String extra = plain(row, "ADDTNL_IN_VAL"); if (!extra.equals("미확인")) terms.add(extra);
            }
            BigDecimal base = !basics.isEmpty() && basics.stream().allMatch(r -> r.compareTo(basics.getFirst()) == 0) ? basics.getFirst() : null;
            // 일부 우대·이벤트는 별도 상품 안내에 있다. 표의 숫자 최댓값을 상품 최고금리로 오인하지 않는다.
            products.add(new Product(entry.getKey(), "SC제일은행", name, "BANK", null, base, null, "VARIABLE_DEPOSIT",
                String.join("\n", terms) + "\n입출금 금리 공시는 기존 가입 상품을 포함할 수 있어요. 신규 가입 가능 여부와 별도 우대·이벤트 조건은 상품 안내에서 확인해 주세요. 최고금리는 미확인이며 전체 잔액에 임의 적용하지 않아요.",
                null, null, null, null, null, "SC제일은행 개인 입출금 금리 공시", OfficialCashClient.Source.SC.url, null,
                effectiveDates.size() == 1 ? effectiveDates.iterator().next() : null, at));
        }
        if (products.isEmpty()) throw changed("SC 개인 입출금 상품");
        return List.copyOf(products);
    }

    static List<Product> kb(String json, OffsetDateTime at) {
        var root = JSON.readTree(json);
        var m = java.util.regex.Pattern.compile("(20\\d{2})/(\\d{2})/(\\d{2})").matcher(required(root, "cma100"));
        if (!m.find()) throw changed("KB 공시일");
        LocalDate date = LocalDate.of(Integer.parseInt(m.group(1)), Integer.parseInt(m.group(2)), Integer.parseInt(m.group(3)));
        var products = new ArrayList<Product>();
        for (String category : List.of("RP", "PROMISSORY_NOTE")) {
            boolean rp = category.equals("RP");
            String reinvestment = plain(root, rp ? "cma001" : "cma002");
            if (!reinvestment.contains("재투자")) throw changed("KB 재투자 조건");
            BigDecimal rate = percent(required(root, rp ? "cma111" : "cma112"));
            products.add(cma("kb-" + category.toLowerCase(java.util.Locale.ROOT), "KB증권", rp ? "KB CMA RP형" : "KB CMA 발행어음형", category,
                rate, rate, "개인 자동투자상품. " + reinvestment + "\n직접 매매하는 약정식 RP·법인 상품은 포함하지 않아요.", reinvestment, date, OfficialCashClient.Source.KB, at));
        }
        return List.copyOf(products);
    }

    static List<Product> shinhan(String json, OffsetDateTime at) {
        var root = JSON.readTree(json);
        if (!required(root.path("header"), "succesCode").equals("0")) throw changed("신한 조회 상태");
        var rows = root.path("body").path("list01").path("outputList");
        if (!rows.isArray()) throw changed("신한 수익률 목록");
        var matches = new ArrayList<JsonNode>();
        for (var row : rows) if (row.path("rp_fund_code").asText().equals("2000")) matches.add(row);
        if (matches.size() != 1) throw changed("신한 개인 CMA 구분");
        var row = matches.getFirst();
        if (!required(row, "fund_nm1").equals("명품 CMA RP(개인)")) throw changed("신한 상품명");
        var rates = new ArrayList<BigDecimal>(); var bands = new ArrayList<String>();
        for (int i = 1; i <= 6; i++) {
            String band = row.path("cntt" + i).asText().strip();
            if (!band.isBlank()) { BigDecimal rate = decimal(required(row, "intrt" + i)); rates.add(rate); bands.add(band + ": " + rate + "%"); }
        }
        if (rates.isEmpty()) throw changed("신한 기간별 금리");
        return List.of(cma("shinhan-personal-rp", "신한투자증권", "명품 CMA RP(개인)", "RP", rates.getFirst(), rates.stream().max(BigDecimal::compareTo).orElseThrow(),
            String.join("\n", bands) + "\n적용금액: " + plain(row, "amt_base") + "\n일반 RP·ISA 전용·법인 CMA 금리와 구분해요.", null, null, OfficialCashClient.Source.SHINHAN, at));
    }

    static List<Product> meritz(String json, OffsetDateTime at) {
        var root = JSON.readTree(json);
        if (!required(root, "sysCode").equals("0") || !root.path("sysNextYn").asText().equals("N")) throw changed("메리츠 조회 상태·연속조회");
        var rows = root.path("resultList").path(0);
        if (!rows.isArray() || rows.size() != 1) throw changed("메리츠 CMA 목록");
        var row = rows.get(0);
        if (!required(row, "Iscd").equals("RP10000") || !required(row, "KorIssuAbwrName").equals("CMA-RP") || !required(row, "CustClsCode").equals("1")) throw changed("메리츠 개인 CMA 구분");
        BigDecimal rate = decimal(required(row, "AplyInrt"));
        String period = required(row, "StplDynu");
        if (!period.matches("[1-9]\\d*")) throw changed("메리츠 약정일수");
        return List.of(cma("meritz-personal-rp", "메리츠증권", "메리츠 CMA(RP형)", "RP", rate, rate,
            "약정일수: " + period + "일. 원금과 세후 이자분을 재투자하며 재투자 시점의 고시 수익률을 확인해 주세요.",
            "원금 + 세후 이자분 재투자", basic(required(row, "InrtAplyDate")), OfficialCashClient.Source.MERITZ, at));
    }

    static List<Product> sk(String json, OffsetDateTime at) {
        var data = JSON.readTree(json).path("output");
        if (!data.path("h_errcode").asText("").isBlank()) throw changed("SK 조회 오류");
        var rows = data.path("OutBlock_2");
        if (!rows.isArray() || rows.size() != Integer.parseInt(required(data, "QueryCnt"))) throw changed("SK 전체 건수");
        var personal = new ArrayList<JsonNode>();
        for (var row : rows) if (required(row, "rp_dcd").equals("30")) personal.add(row);
        if (personal.size() != 1 || !required(personal.getFirst(), "inv_cnt").equals("1일")) throw changed("SK 개인 CMA 구분");
        BigDecimal rate = decimal(required(personal.getFirst(), "rp_int_rt"));
        if (percent(required(data, "o_rp_int_rt")).compareTo(rate) != 0) throw changed("SK 화면 표시 금리 대조");
        LocalDate date = LocalDate.parse(required(data, "bs_dt_format"), DateTimeFormatter.ofPattern("yyyy.MM.dd"));
        return List.of(cma("sk-personal-rp", "SK증권", "Magic CMA (RP형)", "RP", rate, rate,
            "개인 RP형: 영업일 1일 단위 투자. 일반 법인의 30일 투자·직접 매매하는 약정 RP·MMF·MMW 수익률과 구분해요.",
            null, date, OfficialCashClient.Source.SK, at));
    }

    static List<Product> hanwha(String html, OffsetDateTime at) {
        var doc = Jsoup.parse(html);
        var points = doc.select(".FI211_1p_numList > ol > li > p").stream().filter(p -> p.text().contains("금액 구간별 세전")).toList();
        if (points.size() != 1 || !points.getFirst().text().contains("RP 자동투자")) throw changed("한화 Smart CMA 구분");
        var m = java.util.regex.Pattern.compile("금액 구간별 세전,\\s*연 (\\d+(?:\\.\\d+)?)%\\s*~\\s*(\\d+(?:\\.\\d+)?)%,\\s*(20\\d{2}\\.\\d{2}\\.\\d{2}) 기준").matcher(points.getFirst().text());
        if (!m.find()) throw changed("한화 금리 범위·기준일");
        BigDecimal low = decimal(m.group(1)), high = decimal(m.group(2));
        if (low.compareTo(high) > 0) throw changed("한화 금리 범위");
        return List.of(cma("hanwha-smart-rp", "한화투자증권", "Smart CMA (RP형)", "RP", null, high,
            "공시 금액 구간별 세전 연 " + low + "% ~ " + high + "%. 이 안내에는 개별 금액 구간·기본금리·재투자 주기가 명시되어 있지 않아 미확인으로 표시해요. 금액 구간별 적용 조건은 공식 안내에서 확인해 주세요.",
            null, LocalDate.parse(m.group(3), DateTimeFormatter.ofPattern("yyyy.MM.dd")), OfficialCashClient.Source.HANWHA, at));
    }

    static List<Product> hmc(String html, OffsetDateTime at) {
        var doc = Jsoup.parse(html);
        if (!doc.select("h1").text().contains("급여계좌 장점")) throw changed("현대차 급여계좌 구분");
        var rows = doc.select("ul.dot_list > li").stream().filter(r -> r.text().startsWith("하루를 맡겨도 연")).toList();
        if (rows.size() != 1) throw changed("현대차 급여계좌 수익률");
        var m = java.util.regex.Pattern.compile("하루를 맡겨도 연 (\\d+(?:\\.\\d+)?)% 금리 지급\\s*\\((20\\d{2}-\\d{2}-\\d{2}) 기준, RP형, 세전\\)").matcher(rows.getFirst().text());
        if (!m.find()) throw changed("현대차 수익률·기준일");
        BigDecimal rate = decimal(m.group(1));
        return List.of(cma("hmc-salary-rp", "현대차증권", "급여계좌 CMA RP형", "RP", rate, rate,
            rows.getFirst().text() + "\n급여계좌 안내에 공시된 수익률이에요. 급여계좌 가입대상·세부 조건은 공식 안내를 확인해 주세요.",
            null, LocalDate.parse(m.group(2)), OfficialCashClient.Source.HMC, at));
    }

    private static Product cma(String id, String company, String name, String category, BigDecimal base, BigDecimal max, String terms, String reinvestment,
            LocalDate date, OfficialCashClient.Source source, OffsetDateTime at) {
        return new Product(id, company, name, "SECURITIES", category, base, max, "AGREED", terms, null, reinvestment,
            null, null, null, company + " 공식 CMA 안내·공개 조회", source.url, date, null, at);
    }
    private static String cell(Element table, String label) {
        var rows = table.select("tbody tr").stream().filter(r -> r.select("th").text().replaceAll("\\s+", "").equals(label)).toList();
        if (rows.size() != 1 || rows.getFirst().select("td").size() != 1 || rows.getFirst().select("td").text().isBlank()) throw changed("CMA " + label);
        return rows.getFirst().select("td").text();
    }
    private static void noError(JsonNode node) {
        if (!node.path("errorMsg").asText("").isBlank() || !node.path("errMsg").asText("").isBlank()) throw changed("조회 오류");
    }
    private static LocalDate basic(String value) { return LocalDate.parse(value, DateTimeFormatter.BASIC_ISO_DATE); }
    private static String unquote(String value) { return java.net.URLDecoder.decode(value, java.nio.charset.StandardCharsets.UTF_8); }
    private static BigDecimal percent(String value) { return decimal(value.replaceFirst("^연\\s*", "").replaceFirst("%$", "").strip()); }
    private static BigDecimal decimal(String value) {
        if (!value.matches("\\d+(?:\\.\\d+)?")) throw changed("금리 형식");
        return new BigDecimal(value);
    }
    private static String plain(JsonNode node, String key) {
        String value = node.path(key).asText("").strip();
        return value.isBlank() ? "미확인" : Jsoup.parse(value.replace("\n", "<br>")).wholeText().strip();
    }
    private static String required(JsonNode node, String key) {
        var value = node.path(key);
        if ((!value.isTextual() && !value.isNumber()) || value.asText().isBlank()) throw changed(key);
        return value.asText().strip();
    }
    private static String decode(String value, Map<String, String> codes) {
        var result = new ArrayList<String>();
        for (String code : value.split("[,|]")) { String text = codes.get(code.strip()); if (text == null) throw changed("공시 코드"); result.add(text); }
        return String.join(", ", result);
    }
    private static IllegalStateException changed(String field) { return new IllegalStateException("공식 조회 응답 필드 확인 실패: " + field); }
}
