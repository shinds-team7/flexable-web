package com.flexable.web.practice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import com.flexable.web.practice.PracticeDtos.*;

/** 1원·정수 주 단위. 기존 simulation 엔진과 독립적이다. */
public final class PracticeEngine {
    private PracticeEngine() { }
    public record Holding(long cash, long shares) { }
    public record Trade(Holding holding, long shares) { }
    public static Trade trade(Holding holding, Action action, int percent, long price) {
        if (price <= 0 || holding.cash() < 0 || holding.shares() < 0) throw new IllegalArgumentException();
        long quantity = switch (action) {
            case BUY -> Math.multiplyExact(holding.cash(), percent) / 100 / price;
            case SELL -> Math.multiplyExact(holding.shares(), percent) / 100;
            case HOLD -> 0;
        };
        long cost = Math.multiplyExact(quantity, price);
        return switch (action) {
            case BUY -> new Trade(new Holding(holding.cash() - cost, Math.addExact(holding.shares(), quantity)), quantity);
            case SELL -> new Trade(new Holding(Math.addExact(holding.cash(), cost), holding.shares() - quantity), quantity);
            case HOLD -> new Trade(holding, 0);
        };
    }
    public static BigDecimal rate(long difference, long baseline) {
        return BigDecimal.valueOf(difference).divide(BigDecimal.valueOf(baseline), 4, RoundingMode.FLOOR);
    }
    public static Portfolio value(Holding holding, long price, long initial) {
        long stock = Math.multiplyExact(holding.shares(), price), total = Math.addExact(holding.cash(), stock);
        return new Portfolio(holding.cash(), holding.shares(), stock, total, total - initial, rate(total - initial, initial));
    }
    public static String outcome(long baseline, long after, Prediction prediction) {
        return baseline == after ? "NEUTRAL" : ((after > baseline) == (prediction == Prediction.POSITIVE) ? "CORRECT" : "INCORRECT");
    }
}
