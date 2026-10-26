package com.flexable.web.practice;

import java.math.BigDecimal;
import java.util.List;
import java.util.UUID;
import jakarta.validation.constraints.*;
import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.market.PracticeMarketData.Instrument;

public final class PracticeDtos {
    private PracticeDtos() { }
    public record Start(@NotNull UUID startId, @NotBlank @Size(max=32) String categoryCode,
            @NotNull @DecimalMin("10000") @DecimalMax("100000000") @Digits(integer=9, fraction=0) BigDecimal initialAmount) { }
    public record Token(@NotBlank @Size(min=43,max=128) String sessionToken) { }
    public record Command(@NotBlank @Size(min=43,max=128) String sessionToken, @NotNull UUID commandId,
                          @NotNull @Min(0) Integer expectedVersion) { }
    public record Decision(@NotBlank @Size(min=43,max=128) String sessionToken, @NotNull UUID commandId,
            @NotNull @Min(0) Integer expectedVersion, @NotBlank String eventId,
            @NotNull Prediction prediction, @NotNull Action action, @NotNull Integer allocationPercent) { }
    public enum Prediction { POSITIVE, NEGATIVE }
    public enum Action { BUY, SELL, HOLD }
    public record Category(String code, String name, String classificationVersion, int eligibleCount) { }
    public record Categories(List<Category> categories, boolean isSample) { }
    public record Started(String sessionToken, String expiresAt, Snapshot snapshot) { }
    public record Portfolio(long cash, long shares, long stockValue, long total, long profit, BigDecimal returnRate) { }
    public record Event(String id, String title, String publishedDate, String baselineDate, String sourceUrl, String sourceName) { }
    public record Result(String eventId, String title, String publishedDate, String baselineDate, String sourceUrl,
            Prediction prediction, Action action, int allocationPercent, String execution, String executedDate,
            Long executedPrice, Long executedShares, String outcome, String outcomeDate, BigDecimal subsequentReturnRate) { }
    /** 이번 진행 요청으로 새로 공개된 봉의 날짜와 그날 종가 기준 자산 */
    public record Frame(String date, Portfolio portfolio) { }
    public record Snapshot(int version, String status, Instrument instrument, long initialAmount, boolean isSample,
            List<Candle> candles, List<Frame> frames, Portfolio portfolio, Event event, List<Result> decisions, String notice, List<String> sources) { }
}
