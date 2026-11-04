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
            @JsonFormat(pattern = "yyyy-MM-dd'T'HH:mm:ss.SSSXXX", timezone = "Asia/Seoul") OffsetDateTime verifiedAt) {
        Product withId(String publicId) {
            return new Product(publicId, company, name, sector, category, baseRate, maxRate, rateType, conditions,
                    interestPayment, reinvestment, depositProtected, maxLimit, rateLimit,
                    sourceName, sourceUrl, sourceAsOf, effectiveFrom, verifiedAt);
        }
    }

    public record ProductList(List<Product> items, boolean isSample, String notice) {}
}
