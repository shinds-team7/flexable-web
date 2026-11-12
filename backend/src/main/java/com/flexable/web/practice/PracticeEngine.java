package com.flexable.web.practice;

import java.math.BigDecimal;
import java.math.RoundingMode;
import com.flexable.web.practice.PracticeDtos.*;

/** 1원·정수 주 단위. 기존 simulation 엔진과 독립적이다. */
public final class PracticeEngine {
    private PracticeEngine() { }
    /** averagePrice: 이동평균 평단가(원 단위 내림), 보유 0주면 null(policies §5 "평단가") */
    public record Holding(long cash, long shares, Long averagePrice) {
        public Holding(long cash, long shares) { this(cash, shares, null); }
        /** n주를 price에 산 뒤. (기존 평단가 × 기존 수량 + 체결가 × 체결 수량) / 새 수량, 원 단위 내림 */
        public Holding bought(long n, long price) {
            if (n == 0) return this;
            long held = Math.addExact(shares, n);
            long cost = Math.addExact(shares == 0 ? 0 : Math.multiplyExact(java.util.Objects.requireNonNull(averagePrice), shares), Math.multiplyExact(n, price));
            return new Holding(cash - Math.multiplyExact(n, price), held, cost / held);
        }
        /** n주를 price에 판 뒤. 평단가는 그대로이고 전량 매도면 null */
        public Holding sold(long n, long price) {
            if (n == 0) return this;
            long held = shares - n;
            return new Holding(Math.addExact(cash, Math.multiplyExact(n, price)), held, held == 0 ? null : averagePrice);
        }
    }
    public record Trade(Holding holding, long shares) { }
    public static Trade trade(Holding holding, Action action, int percent, long price) {
        if (price <= 0 || holding.cash() < 0 || holding.shares() < 0) throw new IllegalArgumentException();
        long quantity = switch (action) {
            case BUY -> Math.multiplyExact(holding.cash(), percent) / 100 / price;
            case SELL -> Math.multiplyExact(holding.shares(), percent) / 100;
            case HOLD -> 0;
        };
        return switch (action) {
            case BUY -> new Trade(holding.bought(quantity, price), quantity);
            case SELL -> new Trade(holding.sold(quantity, price), quantity);
            case HOLD -> new Trade(holding, 0);
        };
    }
    public static BigDecimal rate(long difference, long baseline) {
        return BigDecimal.valueOf(difference).divide(BigDecimal.valueOf(baseline), 4, RoundingMode.FLOOR);
    }
    public static Portfolio value(Holding holding, long price, long initial) {
        long stock = Math.multiplyExact(holding.shares(), price), total = Math.addExact(holding.cash(), stock);
        return new Portfolio(holding.cash(), holding.shares(), stock, total, total - initial, rate(total - initial, initial), holding.averagePrice());
    }
    public static String outcome(long baseline, long after, Prediction prediction) {
        return baseline == after ? "NEUTRAL" : ((after > baseline) == (prediction == Prediction.POSITIVE) ? "CORRECT" : "INCORRECT");
    }
}
