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
        EUGENE("eugene-cma-rp", "cma", "https://www.eugenefn.com/ingo/igca/igca100r.do"),
        FSB("fsb-demand-deposits", "parking", "https://www.fsb.or.kr/ratanym_0100.act"),
        MIRAE_RP("mirae-cma-rp", "cma", "https://securities.miraeasset.com/hks/hks4033/n01.do");
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
        URI resource = source == Source.FSB ? target.page().resolve("ratanym_0100_01.act") : target.page();
        String resourcePath = source == Source.FSB ? official.resolve("ratanym_0100_01.act").getRawPath() : official.getRawPath();
        if (robots != null && (!CashRobots.allowed(robots, official.getRawPath()) || !CashRobots.allowed(robots, resourcePath)))
            throw new IllegalStateException("robots 정책으로 수집하지 않습니다");
        String html = source == Source.FSB ? request(resource, false,
            "ORDERBY=BANK_NAME+ASC&RATE_HIGH=0&RATE_HIGH_UPPER=true&DEPO_INTS_PRVS_MTHD_CD=1%7C2%7C3%7C4%7C5%7C6&JOIN_LOCATION=1%7C2%7C3%7C4%7C5%7C9&SEARCH_SELECT_IN=&SEARCH_TEXT_IN=")
            : get(target.page(), false);
        return switch (source) {
            case KBANK -> OfficialCashParser.kbank(html, verifiedAt);
            case EUGENE -> OfficialCashParser.eugene(html, verifiedAt);
            case FSB -> OfficialCashParser.fsbExport(html, verifiedAt);
            case MIRAE_RP -> OfficialCashParser.miraeRp(html, verifiedAt);
        };
    }
    private String get(URI uri, boolean robots) {
        return request(uri, robots, null);
    }
    private String request(URI uri, boolean robots, String form) {
        try {
            var builder = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                    .header("User-Agent", "FlexableWebCatalog/1.0").header("Accept", "text/html,text/plain");
            var request = form == null ? builder.GET().build() : builder.header("Content-Type", "application/x-www-form-urlencoded")
                    .POST(HttpRequest.BodyPublishers.ofString(form)).build();
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
                if (response.statusCode() != 200) throw new IllegalStateException("공식 출처 HTTP " + response.statusCode());
                String text = new String(response.body(), StandardCharsets.UTF_8);
                if (!robots) {
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
