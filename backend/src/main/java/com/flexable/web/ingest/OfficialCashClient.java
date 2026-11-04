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
        EUGENE("eugene-cma-rp", "cma", "https://www.eugenefn.com/ingo/igca/igca100r.do");
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
    public List<Product> fetch(Source source, OffsetDateTime verifiedAt) {
        URI official = URI.create(source.url);
        Target target = testTargets.getOrDefault(source, new Target(official, official.resolve("/robots.txt")));
        String robots = get(target.robots(), true);
        if (robots != null && !CashRobots.allowed(robots, official.getRawPath()))
            throw new IllegalStateException("robots 정책으로 수집하지 않습니다");
        String html = get(target.page(), false);
        return source == Source.KBANK ? OfficialCashParser.kbank(html, verifiedAt) : OfficialCashParser.eugene(html, verifiedAt);
    }
    private String get(URI uri, boolean robots) {
        try {
            var request = HttpRequest.newBuilder(uri).timeout(Duration.ofSeconds(20))
                    .header("User-Agent", "FlexableWebCatalog/1.0").header("Accept", "text/html,text/plain").GET().build();
            var pending = http.sendAsync(request, info -> new LimitedBody());
            HttpResponse<byte[]> response;
            try { response = pending.get(20, java.util.concurrent.TimeUnit.SECONDS); }
            catch (java.util.concurrent.TimeoutException e) {
                pending.cancel(true);
                throw new IllegalStateException("공식 출처 응답 시간 초과");
            }
                if (robots && response.statusCode() == 404) return null;
                if (response.statusCode() != 200) throw new IllegalStateException("공식 출처 HTTP " + response.statusCode());
                String text = new String(response.body(), StandardCharsets.UTF_8);
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
