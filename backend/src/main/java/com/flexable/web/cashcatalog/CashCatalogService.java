package com.flexable.web.cashcatalog;

import java.math.BigDecimal;
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
import com.flexable.web.cashcatalog.CashCatalogDtos.CmaSimulation;
import com.flexable.web.cashcatalog.CashCatalogDtos.ParkingSimulateRequest;
import com.flexable.web.cashcatalog.CashCatalogDtos.ParkingSimulation;
import com.flexable.web.cashcatalog.CashCatalogDtos.ProductList;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;

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
                .map(p -> p.withCalc(kind.equals("parking") ? ParkingCalculator.assess(p)
                        : CmaCalculator.assess(p)))
                .sorted(Comparator.comparing(Product::company).thenComparing(Product::name).thenComparing(Product::id))
                .toList();
        String notice = items.isEmpty() ? "확인된 공시 자료를 준비 중이에요. 실제 상품 데이터는 아직 등록되지 않았어요."
                : "현재 연결된 일부 금융회사의 공식 자료예요. 공시 금리·수익률은 세전 연 기준이며 변경될 수 있어요. 금액·기간 구간과 우대조건, 기준일을 함께 확인해 주세요. 수익을 보장하지 않아요.";
        return new ProductList(items, false, notice);
    }

    /** 파킹통장 기본금리 이자 계산(policies §11). 계산할 수 없는 상품은 이유와 함께 400. */
    @Transactional(readOnly = true)
    public ParkingSimulation simulateParking(ParkingSimulateRequest r) {
        if (r == null || r.productId() == null || r.productId().isBlank()) throw ApiException.invalid("productId", "상품을 골라 주세요");
        if (r.amount() == null || r.amount() < 1 || r.amount() > ParkingCalculator.MAX_AMOUNT)
            throw ApiException.invalid("amount", "금액은 1원 이상 100억 원 이하로 넣어 주세요");
        if (r.days() == null || r.days() < 1 || r.days() > ParkingCalculator.MAX_DAYS)
            throw ApiException.invalid("days", "기간은 1일 이상 3,650일 이하로 넣어 주세요");
        Product p = list("parking").items().stream().filter(x -> x.id().equals(r.productId())).findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "파킹통장 상품을 찾지 못했어요"));
        if (!p.calculable()) throw ApiException.invalid("productId", p.calcReason());
        boolean tiered = "TIERED".equals(p.calcMode());
        var c = tiered ? ParkingCalculator.calculateTiered(r.amount(), r.days(), p.tiers())
                : ParkingCalculator.calculate(r.amount(), r.days(), p.baseRate());
        return new ParkingSimulation(p.id(), r.amount(), r.days(), p.calcMode(), tiered ? null : p.baseRate(),
                tiered ? ParkingCalculator.parts(r.amount(), p.tiers()) : List.of(), c.interestPreTax(), c.tax(),
                c.interestAfterTax(), ParkingCalculator.RULES_VERSION, tiered
                ? "공시 원문의 구간별 금리를 구간 안의 금액에만 적용한 예상 세전 이자예요. 우대·이벤트는 반영하지 않았고 금리가 바뀌면 달라져요. 세금은 15.4%로 계산했어요."
                : "공시 기본금리만 쓴 예상 세전 이자예요. 우대·이벤트와 금액 구간은 반영하지 않았고 금리가 바뀌면 달라져요. 세금은 15.4%로 계산했어요.");
    }

    /** CMA 예상 이자 계산(policies §12). 재투자는 반영하지 않는다. 계산할 수 없는 상품은 이유와 함께 400. */
    @Transactional(readOnly = true)
    public CmaSimulation simulateCma(ParkingSimulateRequest r) {
        if (r == null || r.productId() == null || r.productId().isBlank()) throw ApiException.invalid("productId", "상품을 골라 주세요");
        if (r.amount() == null || r.amount() < 1 || r.amount() > ParkingCalculator.MAX_AMOUNT)
            throw ApiException.invalid("amount", "금액은 1원 이상 100억 원 이하로 넣어 주세요");
        if (r.days() == null || r.days() < 1 || r.days() > ParkingCalculator.MAX_DAYS)
            throw ApiException.invalid("days", "기간은 1일 이상 3,650일 이하로 넣어 주세요");
        Product p = list("cma").items().stream().filter(x -> x.id().equals(r.productId())).findFirst()
                .orElseThrow(() -> new ApiException(ErrorCode.NOT_FOUND, "CMA 상품을 찾지 못했어요"));
        if (!p.calculable()) throw ApiException.invalid("productId", p.calcReason());
        BigDecimal rate;
        if ("PERIOD_RATE".equals(p.calcMode())) {
            rate = CmaCalculator.rateFor(p.periods(), r.days());
            if (rate == null) throw ApiException.invalid("days", CmaCalculator.maxDays(p.periods())
                    + "일까지만 계산해요. 그 뒤에는 재투자하는 날의 새 수익률이 적용돼요");
        } else {
            rate = p.baseRate();
        }
        var c = ParkingCalculator.calculate(r.amount(), r.days(), rate);
        return new CmaSimulation(p.id(), r.amount(), r.days(), p.calcMode(), rate, c.interestPreTax(), c.tax(),
                c.interestAfterTax(), CmaCalculator.RULES_VERSION,
                "공시 약정수익률이 그대로 유지된다고 가정한 예상 세전 이자예요. 재투자(복리)는 반영하지 않았고 수익률은 바뀔 수 있어요. 원금 손실 가능성이 있고 예금자보호 여부는 상품마다 달라요. 세금은 15.4%로 계산했어요.");
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
