package com.flexable.web.cashcatalog;

import java.math.BigDecimal;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.util.List;
import com.fasterxml.jackson.annotation.JsonFormat;

public final class CashCatalogDtos {
    private CashCatalogDtos() {}

    public record Product(String id, String company, String name, String sector, String category,
            BigDecimal baseRate, BigDecimal maxRate, String rateType, String conditions,
            String interestPayment, String reinvestment, Boolean depositProtected, Long maxLimit, Long rateLimit,
            String sourceName, String sourceUrl, LocalDate sourceAsOf, LocalDate effectiveFrom,
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", timezone = "Asia/Seoul") OffsetDateTime verifiedAt,
            List<String> tags, boolean calculable, String calcReason, String calcMode, List<Tier> tiers) {
        /** 수집기가 만드는 형태. tags는 공개 조회 때 {@link CashTags}가 채운다. */
        public Product(String id, String company, String name, String sector, String category,
                BigDecimal baseRate, BigDecimal maxRate, String rateType, String conditions,
                String interestPayment, String reinvestment, Boolean depositProtected, Long maxLimit, Long rateLimit,
                String sourceName, String sourceUrl, LocalDate sourceAsOf, LocalDate effectiveFrom,
                OffsetDateTime verifiedAt) {
            this(id, company, name, sector, category, baseRate, maxRate, rateType, conditions, interestPayment,
                    reinvestment, depositProtected, maxLimit, rateLimit, sourceName, sourceUrl, sourceAsOf,
                    effectiveFrom, verifiedAt, List.of(), false, null, null, List.of());
        }

        Product withId(String publicId) {
            return new Product(publicId, company, name, sector, category, baseRate, maxRate, rateType, conditions,
                    interestPayment, reinvestment, depositProtected, maxLimit, rateLimit,
                    sourceName, sourceUrl, sourceAsOf, effectiveFrom, verifiedAt, tags, calculable, calcReason, calcMode, tiers);
        }

        Product withTags(List<String> value) {
            return new Product(id, company, name, sector, category, baseRate, maxRate, rateType, conditions,
                    interestPayment, reinvestment, depositProtected, maxLimit, rateLimit,
                    sourceName, sourceUrl, sourceAsOf, effectiveFrom, verifiedAt, value, calculable, calcReason, calcMode, tiers);
        }

        Product withCalc(ParkingCalculator.Assessment a) {
            return new Product(id, company, name, sector, category, baseRate, maxRate, rateType, conditions,
                    interestPayment, reinvestment, depositProtected, maxLimit, rateLimit,
                    sourceName, sourceUrl, sourceAsOf, effectiveFrom, verifiedAt, tags, a.mode() != null, a.reason(),
                    a.mode(), a.tiers());
        }
    }

    public record ProductList(List<Product> items, boolean isSample, String notice) {}

    /** 구간 금리 한 줄. upTo가 null이면 그 위 전부. */
    public record Tier(Long upTo, BigDecimal rate) {}

    public record ParkingSimulateRequest(String productId, Long amount, Integer days) {}

    /** 구간별 계산 내역. 구간 안에 들어간 금액에 그 구간 금리를 적용한 값. */
    public record ParkingPart(Long upTo, BigDecimal rate, long amount) {}

    public record ParkingSimulation(String productId, long amount, int days, String mode, BigDecimal baseRate,
            List<ParkingPart> parts, long interestPreTax, long tax, long interestAfterTax, String rulesVersion, String notice) {}
}
