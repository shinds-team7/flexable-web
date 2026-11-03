package com.flexable.web.market;

import java.util.ArrayList;
import java.util.Comparator;
import java.util.HashSet;
import java.util.List;
import java.util.Optional;
import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.market.PracticeMarketData.News;

/**
 * 사건 퀴즈의 출제 규칙과 재생 구간 고르기(docs/policies.md §5). 세션(practice)과 수집(ingest)이 같은 규칙을 쓴다.
 * 구간은 연속된 유효 OHLC 120~250거래일이고 출제 문제가 3개 이상이어야 한다. 가장 짧은 길이 → 문제 많은 창 → 가장 최근 창 순으로 고른다.
 */
public final class PracticeWindow {
    private PracticeWindow() { }
    /** 재생 구간 최소·최대 길이(거래일) */
    public static final int MIN_LENGTH = 120;
    public static final int MAX_LENGTH = 250;
    /** 첫 사건 전에 보여 줄 최소 거래일 수 */
    public static final int LEAD_DAYS = 14;
    /** 방향 판정에 쓰는 사건 뒤 거래일 수 */
    public static final int FOLLOW_DAYS = 5;
    /** 한 구간에서 꼭 만나야 하는 문제 수. 더 많아도 된다 */
    public static final int MIN_QUESTIONS = 3;
    /** 최대 길이에서 간격 규칙으로 나올 수 있는 문제 수 상한(세션·계약 상한) */
    public static final int MAX_QUESTIONS = (MAX_LENGTH - LEAD_DAYS - FOLLOW_DAYS - 1) / (FOLLOW_DAYS + 1) + 1;

    public record Question(int index, News news) { }
    /** start: 받은 봉 목록에서 구간 첫 봉의 위치 */
    public record Choice(int start, List<Candle> candles, List<News> news, List<Question> questions) { }

    private static List<News> ordered(List<News> news) {
        return news.stream().sorted(Comparator.comparing(News::publishedDate).thenComparing(News::id)).toList();
    }

    /** 접수일·접수번호 순으로 접수일 당일 봉 뒤에 공개하고, 시작 14거래일·직전 문제 판정·사건 뒤 5거래일을 채우는 공시를 모두 출제한다 */
    public static List<Question> questions(List<Candle> candles, List<News> news) {
        if (candles.isEmpty()) return List.of();
        var ordered = ordered(news);
        int[] at = new int[ordered.size()];
        for (int n = 0; n < ordered.size(); n++) at[n] = position(candles, ordered.get(n).publishedDate());
        return questions(ordered, at, 0, candles.size());
    }

    /** 접수일 당일(휴일이면 직전 거래일) 봉 위치. 첫 봉보다 앞서면 -1 */
    private static int position(List<Candle> candles, String date) {
        int lo = 0, hi = candles.size() - 1, found = -1;
        while (lo <= hi) {
            int mid = (lo + hi) >>> 1;
            if (candles.get(mid).date().compareTo(date) <= 0) { found = mid; lo = mid + 1; } else hi = mid - 1;
        }
        return found;
    }

    /** ordered·at은 전체 봉 기준. [start, start+length) 창의 문제를 창 안 위치로 돌려준다 */
    private static List<Question> questions(List<News> ordered, int[] at, int start, int length) {
        var result = new ArrayList<Question>(); var seen = new HashSet<String>(); int last = LEAD_DAYS - 1 - FOLLOW_DAYS;
        for (int n = 0; n < ordered.size(); n++) {
            if (!seen.add(ordered.get(n).id()) || at[n] < start) continue;
            int index = at[n] - start;
            if (index <= last + FOLLOW_DAYS || index + FOLLOW_DAYS >= length) continue;
            result.add(new Question(index, ordered.get(n))); last = index;
        }
        return List.copyOf(result);
    }

    /**
     * 날짜순 봉 목록에서 재생 구간을 고른다. 유효하지 않은 봉(OHLC 누락은 0으로 넣는다)이 섞인 창은 쓰지 않는다.
     * 120거래일부터 하루씩 늘려 문제가 3개 이상인 창이 처음 나오는 길이를 쓰고, 그 길이에서 문제가 가장 많은 창, 같으면 가장 최근 창이다.
     * 250거래일까지 없으면 비어 있다. 고른 구간의 공시는 구간 첫 봉~마지막 봉 날짜 안의 것만 남긴다.
     */
    public static Optional<Choice> select(List<Candle> candles, List<News> news) {
        int[] invalid = new int[candles.size() + 1];
        for (int i = 0; i < candles.size(); i++) invalid[i + 1] = invalid[i] + (candles.get(i).valid() ? 0 : 1);
        var ordered = ordered(news);
        int[] at = new int[ordered.size()];
        for (int n = 0; n < ordered.size(); n++) at[n] = position(candles, ordered.get(n).publishedDate());
        for (int length = MIN_LENGTH; length <= Math.min(MAX_LENGTH, candles.size()); length++) {
            int bestStart = -1; List<Question> best = List.of();
            // 뒤에서부터 보므로 더 많을 때만 바꾸면 동률은 가장 최근 창이 남는다
            for (int start = candles.size() - length; start >= 0; start--) {
                if (invalid[start + length] - invalid[start] > 0) continue;
                var questions = questions(ordered, at, start, length);
                if (questions.size() >= MIN_QUESTIONS && questions.size() > best.size()) { bestStart = start; best = questions; }
            }
            if (bestStart < 0) continue;
            var window = candles.subList(bestStart, bestStart + length);
            String from = window.getFirst().date(), to = window.getLast().date();
            return Optional.of(new Choice(bestStart, List.copyOf(window), news.stream()
                    .filter(n -> n.publishedDate().compareTo(from) >= 0 && n.publishedDate().compareTo(to) <= 0).toList(), best));
        }
        return Optional.empty();
    }
}
