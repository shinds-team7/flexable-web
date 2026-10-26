package com.flexable.web.practice;

import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.ZoneOffset;
import java.util.*;
import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;
import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.market.*;
import com.flexable.web.market.PracticeMarketData.*;
import com.flexable.web.practice.PracticeDtos.*;

@Service
@EnableScheduling
public class PracticeService {
    private static final String NOTICE = "과거 시세로 계산한 가상의 결과예요. 앞으로의 수익을 뜻하지 않고 투자 권유가 아니에요. 실제 투자는 원금 손실이 생길 수 있어요. 배당·세금·수수료는 제외했어요. 현재 업종과 수집 대상 종목·일부 공시로 구성되어 전체 시장을 대표하지 않아요.";
    private final PracticeMarketService market;
    private final MarketService listed;
    private final Clock clock;
    private final boolean sample;
    private final int capacity;
    private final SecureRandom random = new SecureRandom();
    private final Map<String, Session> sessions = new HashMap<>();
    private final Map<UUID, String> starts = new HashMap<>();
    public PracticeService(PracticeMarketService market, MarketService listed, Clock clock,
            @Value("${app.ingest.price-source:kiwoom}") String source,
            @Value("${app.practice.capacity:1000}") int capacity) {
        this.market = market; this.listed = listed; this.clock = clock; this.sample = "fake".equals(source); this.capacity = capacity;
    }
    private record Question(int index, News news) { }
    private record Saved(Object input, Snapshot snapshot) { }
    private static class Session {
        final Start input; final Dataset data; final Instant expires; final List<Question> questions;
        final Map<UUID, Saved> commands = new HashMap<>(); final List<Result> decisions = new ArrayList<>();
        final List<Integer> decisionIndices = new ArrayList<>();
        final Snapshot first;
        int index = 0, version = 0;
        PracticeEngine.Holding holding;
        Session(Start input, Dataset data, Instant expires) {
            this.input = input; this.data = data; this.expires = expires; questions = questions(data);
            holding = PracticeEngine.trade(new PracticeEngine.Holding(input.initialAmount().longValueExact(), 0), Action.BUY, 50, data.candles().getFirst().open()).holding();
            first = snapshot(this);
        }
    }
    /** 첫 사건 전에 보여 줄 최소 거래일 수 */
    static final int LEAD_DAYS = 14;
    private static List<Question> questions(Dataset data) {
        var result = new ArrayList<Question>(); var seen = new HashSet<String>(); int last = LEAD_DAYS - 6;
        for (var news : data.news().stream().sorted(Comparator.comparing(News::publishedDate).thenComparing(News::id)).toList()) {
            if (!seen.add(news.id()) || news.publishedDate().compareTo(data.candles().getFirst().date()) < 0) continue;
            int index = -1;
            for (int i = 0; i < data.candles().size(); i++) {
                if (data.candles().get(i).date().compareTo(news.publishedDate()) <= 0) index = i; else break;
            }
            if (index <= last + 5 || index + 5 >= data.candles().size()) continue;
            result.add(new Question(index, news)); last = index;
            if (result.size() == 3) break;
        }
        return List.copyOf(result);
    }
    private List<Dataset> eligible() {
        return market.all().stream().filter(d -> d.isSample() == sample)
                .filter(d -> sample || listed.find(d.instrument().code()).isPresent())
                .filter(d -> !questions(d).isEmpty()).toList();
    }
    public Categories categories() {
        var groups = new LinkedHashMap<String, List<Dataset>>();
        eligible().stream().sorted(Comparator.comparing(d -> d.instrument().categoryName()))
                .forEach(d -> groups.computeIfAbsent(d.instrument().categoryCode(), k -> new ArrayList<>()).add(d));
        return new Categories(groups.values().stream().map(ds -> {
            var i = ds.getFirst().instrument();
            if (ds.stream().anyMatch(d -> !d.instrument().categoryName().equals(i.categoryName()))) throw new ApiException(ErrorCode.PRACTICE_UNAVAILABLE);
            return new Category(i.categoryCode(), i.categoryName(), i.classificationVersion(), ds.size());
        }).toList(), sample);
    }
    public synchronized Started start(Start input) {
        clean();
        String prior = starts.get(input.startId());
        if (prior != null) {
            var s = sessions.get(prior);
            if (!s.input.equals(input)) throw conflict();
            return started(prior, s);
        }
        if (sessions.size() >= capacity) throw new ApiException(ErrorCode.PRACTICE_CAPACITY);
        var choices = eligible().stream().filter(d -> d.instrument().categoryCode().equals(input.categoryCode())).toList();
        if (choices.isEmpty()) throw new ApiException(ErrorCode.PRACTICE_UNAVAILABLE);
        var session = new Session(input, choices.get(random.nextInt(choices.size())), clock.instant().plusSeconds(1800));
        byte[] bytes = new byte[32]; random.nextBytes(bytes);
        String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
        sessions.put(token, session); starts.put(input.startId(), token);
        return started(token, session);
    }
    private static Started started(String token, Session s) {
        return new Started(token, s.expires.atOffset(ZoneOffset.ofHours(9)).toString(), s.first);
    }
    @Scheduled(fixedDelay = 60000)
    public synchronized void clean() {
        var expired = sessions.entrySet().stream().filter(e -> !clock.instant().isBefore(e.getValue().expires)).map(Map.Entry::getKey).toList();
        expired.forEach(this::end);
    }
    private synchronized Session session(String token) {
        clean(); var s = sessions.get(token);
        if (s == null) throw new ApiException(ErrorCode.PRACTICE_EXPIRED);
        return s;
    }
    public synchronized void end(String token) {
        var s = sessions.remove(token);
        if (s != null) starts.remove(s.input.startId());
    }
    public synchronized Snapshot state(String token) { return snapshot(session(token)); }
    private static ApiException conflict() { return new ApiException(ErrorCode.PRACTICE_CONFLICT); }
    private static Snapshot replay(Session s, UUID id, int version, Object input) {
        var saved = s.commands.get(id);
        if (saved != null) {
            if (!saved.input().equals(input)) throw conflict();
            return saved.snapshot();
        }
        if (s.version != version || s.commands.size() >= 128) throw conflict();
        return null;
    }
    public synchronized Snapshot step(Command input) {
        var s = session(input.sessionToken());
        var old = replay(s, input.commandId(), input.expectedVersion(), input); if (old != null) return old;
        if (!status(s).equals("RUNNING")) throw conflict();
        // 다음 사건 또는 마지막 봉까지 한 번에 진행하고, 화면이 하루씩 그리도록 날마다의 자산을 함께 준다
        var frames = new ArrayList<Frame>();
        do {
            advance(s);
            var candle = s.data.candles().get(s.index);
            frames.add(new Frame(candle.date(), PracticeEngine.value(s.holding, candle.close(), s.input.initialAmount().longValueExact())));
        } while (status(s).equals("RUNNING"));
        return save(s, input.commandId(), input, frames);
    }
    private static void advance(Session s) {
        s.index++;
        var candle = s.data.candles().get(s.index);
        for (int n = 0; n < s.decisions.size(); n++) {
            var r = s.decisions.get(n);
            if ("PENDING".equals(r.execution())) {
                var trade = PracticeEngine.trade(s.holding, r.action(), r.allocationPercent(), candle.open());
                s.holding = trade.holding();
                r = new Result(r.eventId(), r.title(), r.publishedDate(), r.baselineDate(), r.sourceUrl(), r.prediction(), r.action(), r.allocationPercent(),
                        r.action() == Action.HOLD ? "HOLD" : trade.shares() == 0 ? "NO_FILL" : "FILLED", candle.date(), candle.open(), trade.shares(), null, null, null);
            }
            int baseline = s.decisionIndices.get(n);
            if (s.index == baseline + 5) {
                long price = s.data.candles().get(baseline).close();
                r = new Result(r.eventId(), r.title(), r.publishedDate(), r.baselineDate(), r.sourceUrl(), r.prediction(), r.action(), r.allocationPercent(), r.execution(), r.executedDate(), r.executedPrice(), r.executedShares(),
                        PracticeEngine.outcome(price, candle.close(), r.prediction()), candle.date(), PracticeEngine.rate(candle.close() - price, price));
            }
            s.decisions.set(n, r);
        }
    }
    public synchronized Snapshot decide(Decision input) {
        if (input.action() == Action.HOLD ? input.allocationPercent() != 0 : !List.of(25, 50, 100).contains(input.allocationPercent()))
            throw ApiException.invalid("allocationPercent", "매매 비율을 확인해 주세요");
        var s = session(input.sessionToken());
        var old = replay(s, input.commandId(), input.expectedVersion(), input); if (old != null) return old;
        var event = event(s);
        if (event == null || !event.id().equals(input.eventId())) throw conflict();
        s.decisions.add(new Result(event.id(), event.title(), event.publishedDate(), event.baselineDate(), event.sourceUrl(), input.prediction(), input.action(), input.allocationPercent(), "PENDING", null, null, null, null, null, null));
        s.decisionIndices.add(s.index);
        return save(s, input.commandId(), input, List.of());
    }
    private static Snapshot save(Session s, UUID id, Object input, List<Frame> frames) {
        s.version++; var result = snapshot(s, frames); s.commands.put(id, new Saved(input, result)); return result;
    }
    private static Event event(Session s) {
        return s.questions.stream().filter(q -> q.index() == s.index)
                .filter(q -> s.decisions.stream().noneMatch(r -> r.eventId().equals(q.news().id())))
                .map(q -> new Event(q.news().id(), q.news().title(), q.news().publishedDate(), s.data.candles().get(s.index).date(), q.news().sourceUrl(), q.news().sourceName())).findFirst().orElse(null);
    }
    private static String status(Session s) {
        return event(s) != null ? "AWAITING_DECISION" : s.index == s.data.candles().size() - 1 ? "FINISHED" : "RUNNING";
    }
    private static Snapshot snapshot(Session s) { return snapshot(s, List.of()); }
    private static Snapshot snapshot(Session s, List<Frame> frames) {
        long initial = s.input.initialAmount().longValueExact();
        return new Snapshot(s.version, status(s), s.data.instrument(), initial, s.data.isSample(),
                List.copyOf(s.data.candles().subList(0, s.index + 1)), List.copyOf(frames), PracticeEngine.value(s.holding, s.data.candles().get(s.index).close(), initial),
                event(s), List.copyOf(s.decisions), NOTICE, s.data.sources());
    }
}
