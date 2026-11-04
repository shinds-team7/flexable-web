package com.flexable.web.ingest;

import java.net.URI;
import java.net.http.HttpClient;
import java.net.http.HttpRequest;
import java.net.http.HttpResponse;
import java.nio.charset.StandardCharsets;
import java.time.Duration;
import java.time.OffsetDateTime;
import java.util.List;
import java.util.Map;
import org.springframework.stereotype.Component;
import com.flexable.web.cashcatalog.CashCatalogDtos.Product;

@Component
public class OfficialCashClient {
    public enum Source {
        KBANK("kbank-plusbox", "parking", "https://www.kbanknow.com/web/product/deposit/plusbox"),
        KBANK_OTHER("kbank-other-demand", "parking", "https://www.kbanknow.com/web/customer/use-info/info?tab=rate-info"),
        SC("sc-personal-demand", "parking", "https://www.standardchartered.co.kr/np/kr/pl/et/InterestRateDeposit3P.jsp"),
        JEJU("jeju-personal-demand", "parking", "https://www.jejubank.co.kr/hmpg/prdGdnc/sid/iomn.do"),
        EUGENE("eugene-cma-rp", "cma", "https://www.eugenefn.com/ingo/igca/igca100r.do"),
        FSB("fsb-demand-deposits", "parking", "https://www.fsb.or.kr/ratanym_0100.act"),
        MIRAE_RP("mirae-cma-rp", "cma", "https://securities.miraeasset.com/hks/hks4033/n01.do"),
        SAMSUNG("samsung-cma", "cma", "https://www.samsungpop.com/mbw/finance/cma.do?cmd=guide"),
        KB("kb-cma", "cma", "https://m.kbsec.com/go.able?linkcd=s010300010005"),
        SHINHAN("shinhan-cma-rp", "cma", "https://m.shinhansec.com/mweb/fnin/fcma/ffcma0001"),
        MERITZ("meritz-cma-rp", "cma", "https://www.imeritz.com/meritzcma/CmaRp.do"),
        HANWHA("hanwha-cma-rp", "cma", "https://www.hanwhawm.com/static/finance/cma/FI211_1p.htm"),
        HMC("hmc-cma-salary", "cma", "https://www.hmsec.com/mobile/notice_info/guide/salary_account_guide_01.to"),
        SK("sk-magic-cma-rp", "cma", "https://www.sks.co.kr/main/product/cma/mCMA/html/PD_04001_T01.htm");
        public final String key, kind, url;
        Source(String key, String kind, String url) { this.key = key; this.kind = kind; this.url = url; }
    }
    record Target(URI page, URI robots) {}
    private final HttpClient http;
    private final Map<Source, Target> testTargets;
    public OfficialCashClient() { this(Map.of()); }
    /** 패키지 내부 테스트용. 운영 주소는 Source에 고정되어 있다. */
    OfficialCashClient(Map<Source, Target> testTargets) {
        this.testTargets = Map.copyOf(testTargets);
        this.http = HttpClient.newBuilder().connectTimeout(Duration.ofSeconds(5))
                .followRedirects(HttpClient.Redirect.NEVER).build();
    }
    List<Source> sources() { return testTargets.isEmpty() ? List.of(Source.values()) : List.copyOf(testTargets.keySet()); }
    public List<Product> fetch(Source source, OffsetDateTime verifiedAt) {
        URI official = URI.create(source.url);
        Target target = testTargets.getOrDefault(source, new Target(official, official.resolve("/robots.txt")));
        String robots = get(target.robots(), true);
        allowed(robots, official.getRawPath() + (official.getRawQuery() == null ? "" : "?" + official.getRawQuery()));
        if (source == Source.FSB) {
            String filters = "{\"ORDERBY\":\"BANK_NAME ASC\",\"RATE_HIGH\":\"0\",\"RATE_HIGH_UPPER\":\"true\",\"DEPO_INTS_PRVS_MTHD_CD\":\"1|2|3|4|5|6\",\"JOIN_LOCATION\":\"1|2|3|4|5|9\",\"END_NUM\":\"100000\",\"START_NUM\":\"1\",\"SEARCH_SELECT_IN\":\"\",\"SEARCH_TEXT_IN\":\"\"}";
            String encoded = java.net.URLEncoder.encode(filters, StandardCharsets.UTF_8).replace("+", "%20");
            String form = "_JSON_=" + java.net.URLEncoder.encode(encoded, StandardCharsets.UTF_8);
            return OfficialCashJsonParser.fsb(query(source, target, robots, "/ratanym_0100.jct", "ratanym_0100.jct", form, false), verifiedAt);
        }
        if (source == Source.KBANK_OTHER) return OfficialCashJsonParser.kbankOther(query(source, target, robots,
            "/ib20/act/WEBCSTUIF0000300A", "kbank-other-json", "inqryType=SALE", false), verifiedAt);
        if (source == Source.JEJU) {
            String path = "/hmpg/prdGdnc/sid/mndp.doax?orderBy=rcmd&typCdVal=02&jnptVal=&joingTrmCdVal=&chrcCdVal=&viewCount=999&isMore=0&moreIdx=&lastId=&keyword=";
            var candidates = JejuCashParser.catalog(query(source, target, robots, path, "jeju-catalog-json", null, false));
            var result = new java.util.ArrayList<Product>();
            for (var candidate : candidates) {
                URI detail = URI.create(JejuCashParser.detailPath(candidate.id()));
                allowed(robots, detail.getRawPath() + "?" + detail.getRawQuery());
                URI uri = testTargets.containsKey(source) ? target.page().resolve("jeju-detail-" + candidate.id()) : detail;
                result.add(JejuCashParser.detail(candidate, get(uri, false), verifiedAt));
            }
            return List.copyOf(result);
        }
        if (source == Source.SC) {
            String date = verifiedAt.toLocalDate().toString();
            String tail = "\",\"PARTY_FG\":\"P\",\"TYPE_CD\":\"243\",\"searchdate\":\"" + date + "\",\"searchexist\":\"\",\"searchyear\":\"" + date.substring(0, 4) + "\",\"searchmonth\":\"" + date.substring(5, 7) + "\",\"searchday\":\"" + date.substring(8) + "\"}";
            String prefix = "{\"serviceID\":\"HP_AP_RM_DepRate.";
            String middle = "\",\"task\":\"com.scfirstbank.web.ap.rm.task.HP_AP_RM_DepRateTask\",\"action\":\"";
            return OfficialCashJsonParser.sc(
                query(source, target, robots, "/np/kr/pl/et/selectFrontDepRateList", "sc-rate-json", prefix + "selectFrontDepRateList" + middle + "selectFrontDepRateList" + tail, true),
                query(source, target, robots, "/np/kr/pl/et/selectFrontDepRateSelBoxList", "sc-catalog-json", prefix + "selectFrontDepRateSelBoxList" + middle + "selectFrontDepRateSelBoxList" + tail, true), verifiedAt);
        }
        if (source == Source.KB) return OfficialCashJsonParser.kb(query(source, target, robots,
            "/ndatatopweb/www/json/main/rate_manage_cma.json", "kb-json", null, false), verifiedAt);
        if (source == Source.SHINHAN) return OfficialCashJsonParser.shinhan(query(source, target, robots,
            "/mweb/api/fnin/fcma/rprtList", "shinhan-json", "{\"url\":\"/mweb/api/fnin/fcma/rprtList\",\"callbackFun\":\"ffcma0001.rprtList_callback\"}", true), verifiedAt);
        if (source == Source.MERITZ) return OfficialCashJsonParser.meritz(query(source, target, robots,
            "/meritzcma/RPErtSearch.go", "meritz-json", "iscd=RP10000&aplyDate=" + verifiedAt.toLocalDate().format(java.time.format.DateTimeFormatter.ofPattern("yyyy.MM.dd")), false), verifiedAt);
        if (source == Source.SK) return OfficialCashJsonParser.sk(query(source, target, robots,
            "/main/product/rp/MAGIC_CMA_DATA_Q.cmd", "sk-json", "", false), verifiedAt);
        String html = get(target.page(), false);
        if (source == Source.SAMSUNG) return OfficialCashJsonParser.samsung(html,
            query(source, target, robots, "/ux/kor/finance/cma/cma/getAihr103p.do", "samsung-rp-json", "tabInfo=&af_auto_index=start&ajaxQuery=1", false),
            query(source, target, robots, "/mbw/finance/cma.do", "samsung-note-json", "tabInfo=&af_auto_index=start&A_RFRN_SECT_CODE=1&cmd=getList&ajaxQuery=1", false), verifiedAt);
        return switch (source) {
            case KBANK -> OfficialCashParser.kbank(html, verifiedAt);
            case EUGENE -> OfficialCashParser.eugene(html, verifiedAt);
            case MIRAE_RP -> OfficialCashParser.miraeRp(html, verifiedAt);
            case HANWHA -> OfficialCashJsonParser.hanwha(html, verifiedAt);
            case HMC -> OfficialCashJsonParser.hmc(html, verifiedAt);
            default -> throw new IllegalStateException("미지원 공식 출처");
        };
    }
    private static void allowed(String robots, String path) {
        if (robots != null && !CashRobots.allowed(robots, path)) throw new IllegalStateException("robots 정책으로 수집하지 않습니다");
    }
    private String query(Source source, Target target, String robots, String path, String fixturePath, String body, boolean jsonBody) {
        allowed(robots, path);
        URI uri = testTargets.containsKey(source) ? target.page().resolve(fixturePath) : URI.create(source.url).resolve(path);
        return request(uri, false, body, jsonBody ? "application/json" : "application/x-www-form-urlencoded", false);
    }
    private String get(URI uri, boolean robots) {
        return request(uri, robots, null);
    }
    private String request(URI uri, boolean robots, String form) {
        return request(uri, robots, form, "application/x-www-form-urlencoded", !robots);
    }
    private String request(URI uri, boolean robots, String body, String contentType, boolean html) {
        try {
            var builder = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                    .header("User-Agent", "FlexableWebCatalog/1.0").header("Accept", html || robots ? "text/html,text/plain" : "application/json,text/plain");
            var request = body == null ? builder.GET().build() : builder.header("Content-Type", contentType)
                    .POST(HttpRequest.BodyPublishers.ofString(body)).build();
            var pending = http.sendAsync(request, info -> new LimitedBody());
            HttpResponse<byte[]> response;
            try { response = pending.get(20, java.util.concurrent.TimeUnit.SECONDS); }
            catch (java.util.concurrent.TimeoutException e) {
                pending.cancel(true);
                throw new IllegalStateException("공식 출처 응답 시간 초과");
            }
                if (robots && response.statusCode() == 404) return null;
                if (robots && uri.getHost().equals("www.fsb.or.kr") && response.statusCode() == 307
                        && response.headers().firstValue("location").orElse("").equals("/404.html")) return null;
                // 이 기관들은 존재하지 않는 경로를 고정 오류 화면으로 돌린다. 상품 리다이렉트는 허용하지 않는다.
                if (robots && response.statusCode() == 302 && (
                    uri.getHost().equals("m.kbsec.com") && response.headers().firstValue("location").orElse("").equals("/etc/MOBI_08_0001.html")
                    || uri.getHost().equals("www.imeritz.com") && response.headers().firstValue("location").orElse("").equals("https://home.imeritz.com/comm/logn/LognErrorOut.jsp"))) return null;
                if (robots && uri.getHost().equals("www.sks.co.kr") && response.statusCode() == 307
                        && response.headers().firstValue("location").orElse("").equals("/main/common/view/CP_00030_4.jsp")) return null;
                if (response.statusCode() != 200) throw new IllegalStateException("공식 출처 HTTP " + response.statusCode());
                String text = new String(response.body(), StandardCharsets.UTF_8);
                if (html) {
                    var charset = java.util.regex.Pattern.compile("(?i)charset\\s*=\\s*['\"]?([a-z0-9._-]+)")
                        .matcher(response.headers().firstValue("content-type").orElse(""));
                    try { text = org.jsoup.Jsoup.parse(new java.io.ByteArrayInputStream(response.body()),
                        charset.find() ? charset.group(1) : null, uri.toString()).outerHtml(); }
                    catch (java.io.IOException e) { throw new IllegalStateException("공식 출처 문자 인코딩 확인 실패"); }
                }
                if (robots && text.stripLeading().startsWith("<")) throw new IllegalStateException("robots 응답 형식 오류");
                return text;
        } catch (InterruptedException e) {
            Thread.currentThread().interrupt();
            throw new IllegalStateException("공식 출처 수집 중단");
        } catch (java.util.concurrent.ExecutionException e) { throw new IllegalStateException("공식 출처 연결·응답 실패"); }
    }

    private static final class LimitedBody implements HttpResponse.BodySubscriber<byte[]> {
        private final java.util.concurrent.CompletableFuture<byte[]> result = new java.util.concurrent.CompletableFuture<>();
        private final java.io.ByteArrayOutputStream bytes = new java.io.ByteArrayOutputStream();
        private java.util.concurrent.Flow.Subscription subscription;
        public java.util.concurrent.CompletionStage<byte[]> getBody() { return result; }
        public void onSubscribe(java.util.concurrent.Flow.Subscription s) { subscription = s; s.request(1); }
        public void onNext(List<java.nio.ByteBuffer> buffers) {
            for (var buffer : buffers) {
                if (buffer.remaining() > 2_000_000 - bytes.size()) {
                    subscription.cancel(); result.completeExceptionally(new IllegalStateException("응답 크기 초과")); return;
                }
                byte[] chunk = new byte[buffer.remaining()]; buffer.get(chunk); bytes.writeBytes(chunk);
            }
            subscription.request(1);
        }
        public void onError(Throwable error) { result.completeExceptionally(error); }
        public void onComplete() { result.complete(bytes.toByteArray()); }
    }
}
