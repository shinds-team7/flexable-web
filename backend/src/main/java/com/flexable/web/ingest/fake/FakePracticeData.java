package com.flexable.web.ingest.fake;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import com.flexable.web.market.PracticeMarketData.*;
import com.flexable.web.market.PracticeMarketService;

/** 실제 회사·공시로 오인하지 않도록 별도 이름을 쓰는 명시적 예시 자료. */
public final class FakePracticeData {
    private FakePracticeData() { }
    public static List<Dataset> create(LocalDate today) {
        var dates = new ArrayList<LocalDate>();
        for (var d = today; dates.size() < 120; d = d.minusDays(1))
            if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) dates.addFirst(d);
        String[] names = {"예시 반도체", "예시 테크", "예시 모터스", "예시 모빌리티", "예시 바이오", "예시 제약"};
        String[] sectors = {"반도체·전자", "반도체·전자", "자동차", "자동차", "바이오·의약", "바이오·의약"};
        var result = new ArrayList<Dataset>();
        for (int n = 0; n < names.length; n++) {
            var random = new Random(81 + n);
            var candles = new ArrayList<Candle>();
            long close = 24000 + n * 8000;
            for (int i = 0; i < 120; i++) {
                long open = Math.max(100, close + (random.nextInt(15) - 7) * 50L);
                double drift = i >= 15 && i <= 20 ? 0.018 : i >= 42 && i <= 47 ? -0.025 : i >= 78 && i <= 83 ? 0.022 : 0.001;
                close = Math.max(100, Math.round(open * (1 + drift + (random.nextDouble() - 0.5) * 0.035) / 10) * 10);
                candles.add(new Candle(dates.get(i).toString(), open, Math.max(open, close) + 100 + random.nextInt(20) * 10L,
                        Math.max(10, Math.min(open, close) - 100 - random.nextInt(20) * 10L), close));
            }
            var news = List.of(
                    new News("sample-" + n + "-1", "해외 고객사와 3년 공급 계약 체결", dates.get(14).toString(), "https://dart.fss.or.kr/", "학습용 예시 사건"),
                    new News("sample-" + n + "-2", "주요 생산 시설의 가동 일시 중단", dates.get(41).toString(), "https://dart.fss.or.kr/", "학습용 예시 사건"),
                    new News("sample-" + n + "-3", "신제품 출시와 연구개발 투자 확대", dates.get(77).toString(), "https://dart.fss.or.kr/", "학습용 예시 사건"));
            result.add(new Dataset(new Instrument("SAMPLE" + n, names[n], PracticeMarketService.categoryCode(sectors[n]), sectors[n],
                    "SAMPLE_V1", today.toString()), List.copyOf(candles), news, true, List.of("학습용 예시 시세·사건 (실제 기업 자료 아님)")));
        }
        return result;
    }
}
