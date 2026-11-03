package com.flexable.web.ingest.fake;

import java.time.DayOfWeek;
import java.time.LocalDate;
import java.util.ArrayList;
import java.util.List;
import java.util.Random;
import com.flexable.web.market.PracticeMarketData.*;
import com.flexable.web.market.PracticeMarketService;
import com.flexable.web.market.PracticeWindow;

/**
 * 실제 회사·공시로 오인하지 않도록 별도 이름을 쓰는 명시적 예시 자료.
 * 실제 수집처럼 최근 5년 평일 시세를 만들고 회사마다 다른 곳에 사건 3건 묶음과 떨어진 단건 2개를 둔 뒤,
 * 같은 규칙(PracticeWindow.select)으로 문제 3개를 만나는 가장 짧은(120거래일 이상) 구간을 고른다.
 */
public final class FakePracticeData {
    private FakePracticeData() { }
    /**
     * 묶음 안 사건 간격(첫 사건 기준 거래일). 짝수 번째 회사는 120거래일 구간의 14·41·77번째 봉,
     * 홀수 번째 회사는 간격이 넓어 135거래일 구간의 14·74·129번째 봉이 된다.
     */
    private static final int[][] CLUSTER = {{0, 27, 63}, {0, 60, 115}};
    public static List<Dataset> create(LocalDate today) {
        var dates = new ArrayList<LocalDate>();
        for (var d = today; !d.isBefore(today.minusYears(5)); d = d.minusDays(1))
            if (d.getDayOfWeek() != DayOfWeek.SATURDAY && d.getDayOfWeek() != DayOfWeek.SUNDAY) dates.addFirst(d);
        String[] names = {"예시 반도체", "예시 테크", "예시 모터스", "예시 모빌리티", "예시 바이오", "예시 제약"};
        String[] sectors = {"반도체·전자", "반도체·전자", "자동차", "자동차", "바이오·의약", "바이오·의약"};
        String[] titles = {"해외 고객사와 3년 공급 계약 체결", "주요 생산 시설의 가동 일시 중단", "신제품 출시와 연구개발 투자 확대"};
        String[] singles = {"최대주주 변경을 위한 주식 양수도 계약", "자기주식 취득 신탁 계약 체결"};
        var result = new ArrayList<Dataset>();
        for (int n = 0; n < names.length; n++) {
            // 회사마다 묶음 위치를 다르게 두고, 단건은 묶음이 든 구간 밖(맨 앞쪽·맨 뒤쪽)에 둔다
            int cluster = 200 + n * 80;
            int[] gap = CLUSTER[n % 2];
            int[] events = {cluster + gap[0], cluster + gap[1], cluster + gap[2]};
            int[] lone = {60, dates.size() - 30};
            var random = new Random(81 + n);
            var candles = new ArrayList<Candle>();
            long close = 24000 + n * 8000;
            for (int i = 0; i < dates.size(); i++) {
                long open = Math.max(100, close + (random.nextInt(15) - 7) * 50L);
                double drift = 0.001;
                for (int k = 0; k < events.length; k++)
                    if (i > events[k] && i <= events[k] + 6) drift = k == 1 ? -0.025 : 0.02;
                close = Math.max(100, Math.round(open * (1 + drift + (random.nextDouble() - 0.5) * 0.035) / 10) * 10);
                candles.add(new Candle(dates.get(i).toString(), open, Math.max(open, close) + 100 + random.nextInt(20) * 10L,
                        Math.max(10, Math.min(open, close) - 100 - random.nextInt(20) * 10L), close));
            }
            var news = new ArrayList<News>();
            for (int k = 0; k < events.length; k++)
                news.add(new News("sample-" + n + "-" + (k + 1), titles[k], dates.get(events[k]).toString(), "https://dart.fss.or.kr/", "학습용 예시 사건"));
            for (int k = 0; k < lone.length; k++)
                news.add(new News("sample-" + n + "-s" + (k + 1), singles[k], dates.get(lone[k]).toString(), "https://dart.fss.or.kr/", "학습용 예시 사건"));
            var window = PracticeWindow.select(candles, news).orElseThrow();
            result.add(new Dataset(new Instrument("SAMPLE" + n, names[n], PracticeMarketService.categoryCode(sectors[n]), sectors[n],
                    "SAMPLE_V1", today.toString()), window.candles(), window.news(), true, List.of("학습용 예시 시세·사건 (실제 기업 자료 아님)")));
        }
        return result;
    }
}
