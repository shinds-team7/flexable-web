package com.flexable.web.cashcatalog;

import java.net.URI;
import java.nio.charset.StandardCharsets;
import java.time.ZoneOffset;
import java.util.Arrays;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Set;
import java.util.UUID;

import org.springframework.stereotype.Service;
import org.springframework.transaction.annotation.Transactional;
import tools.jackson.databind.json.JsonMapper;
import tools.jackson.databind.cfg.DateTimeFeature;

import com.flexable.web.cashcatalog.CashCatalogDtos.Product;
import com.flexable.web.cashcatalog.CashCatalogDtos.ProductList;

@Service
public class CashCatalogService {
    private static final JsonMapper JSON = JsonMapper.builder()
            .disable(DateTimeFeature.ADJUST_DATES_TO_CONTEXT_TIME_ZONE).build();
    private final CashSnapshotRepository snapshots;

    CashCatalogService(CashSnapshotRepository snapshots) { this.snapshots = snapshots; }

    @Transactional(readOnly = true)
    public ProductList list(String kind) {
        checkKind(kind);
        List<Product> items = snapshots.findByKind(kind).stream()
                .flatMap(s -> Arrays.stream(JSON.readValue(s.payload, Product[].class)))
                .map(p -> p.withTags(CashTags.of(p.name(), p.conditions())))
                .sorted(Comparator.comparing(Product::company).thenComparing(Product::name).thenComparing(Product::id))
                .toList();
        String notice = items.isEmpty() ? "확인된 공시 자료를 준비 중이에요. 실제 상품 데이터는 아직 등록되지 않았어요."
                : "현재 연결된 일부 금융회사의 공식 자료예요. 공시 금리·수익률은 세전 연 기준이며 변경될 수 있어요. 금액·기간 구간과 우대조건, 기준일을 함께 확인해 주세요. 수익을 보장하지 않아요.";
        return new ProductList(items, false, notice);
    }

    /** 내부 수집 경계. reference는 수집 판단 근거이며 기관 허가를 뜻하지 않는다(11-04 후속 결정). */
    @Transactional
    public void publish(String kind, String sourceKey, String permissionReference, List<Product> products) {
        checkKind(kind);
        require(sourceKey != null && sourceKey.matches("[a-z0-9][a-z0-9-]{0,99}"), "출처 식별자");
        require(text(permissionReference) && permissionReference.length() <= 2000, "수집 판단 근거");
        require(products != null && !products.isEmpty(), "빈 공시 스냅샷");
        Set<String> ids = new HashSet<>();
        for (Product p : products) {
            require(p != null && text(p.id()) && text(p.company()) && text(p.name()) && text(p.conditions()), "상품·조건");
            require(ids.add(p.id()), "중복 상품");
            require(text(p.sourceName()) && https(p.sourceUrl()) && p.verifiedAt() != null
                    && ZoneOffset.ofHours(9).equals(p.verifiedAt().getOffset()), "출처·검증 시각");
            require((p.baseRate() == null || p.baseRate().signum() >= 0)
                    && (p.maxRate() == null || p.maxRate().signum() >= 0)
                    && (p.maxLimit() == null || p.maxLimit() >= 0)
                    && (p.rateLimit() == null || p.rateLimit() >= 0), "금리·한도");
            boolean parking = kind.equals("parking");
            require(parking ? ("BANK".equals(p.sector()) || "SAVINGS_BANK".equals(p.sector())) && p.category() == null
                    && "VARIABLE_DEPOSIT".equals(p.rateType())
                    : "SECURITIES".equals(p.sector()) && ("RP".equals(p.category()) || "PROMISSORY_NOTE".equals(p.category()))
                    && "AGREED".equals(p.rateType()), "금융권·상품 유형");
        }
        List<Product> publicProducts = products.stream()
                .map(p -> p.withId(key(kind + ":" + sourceKey + ":" + p.id()))).toList();
        snapshots.save(new CashSnapshot(key(kind + ":" + sourceKey), kind, permissionReference,
                JSON.writeValueAsString(publicProducts)));
    }

    /** 허가 철회·판매 종료 시 해당 출처만 명시적으로 제거한다. */
    @Transactional
    public void withdraw(String kind, String sourceKey) {
        checkKind(kind);
        require(text(sourceKey), "출처 식별자");
        snapshots.deleteById(key(kind + ":" + sourceKey));
    }

    @Transactional(readOnly = true)
    public boolean needsRefresh(String kind, String sourceKey, java.time.Instant olderThan) {
        checkKind(kind);
        return snapshots.findById(key(kind + ":" + sourceKey)).map(s ->
                Arrays.stream(JSON.readValue(s.payload, Product[].class))
                        .anyMatch(p -> p.verifiedAt().toInstant().isBefore(olderThan))).orElse(true);
    }

    private static void checkKind(String kind) { require("parking".equals(kind) || "cma".equals(kind), "상품 종류"); }
    private static boolean text(String s) { return s != null && !s.isBlank(); }
    private static boolean https(String s) {
        try { URI uri = URI.create(s); return "https".equals(uri.getScheme()) && uri.getHost() != null
                && uri.getUserInfo() == null; } catch (RuntimeException e) { return false; }
    }
    private static String key(String s) { return UUID.nameUUIDFromBytes(s.getBytes(StandardCharsets.UTF_8)).toString(); }
    private static void require(boolean ok, String field) {
        if (!ok) throw new IllegalArgumentException("공시 스냅샷 검증 실패: " + field);
    }
}
