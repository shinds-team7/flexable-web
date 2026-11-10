package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.security.SecureRandom;
import java.time.Clock;
import java.time.Instant;
import java.time.LocalDate;
import java.time.ZoneId;
import java.time.ZoneOffset;
import java.time.format.DateTimeFormatter;
import java.util.ArrayList;
import java.util.Base64;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Optional;
import java.util.Set;
import java.util.UUID;

import org.slf4j.Logger;
import org.slf4j.LoggerFactory;

import org.springframework.beans.factory.annotation.Value;
import org.springframework.scheduling.annotation.EnableScheduling;
import org.springframework.scheduling.annotation.Scheduled;
import org.springframework.stereotype.Service;

import com.flexable.web.common.ApiException;
import com.flexable.web.common.ErrorCode;
import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Command;
import com.flexable.web.practice.PracticeDtos.Frame;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.practice.PracticeEngine;
import com.flexable.web.virtualsim.VirtualSimDtos.*;
import com.flexable.web.virtualsim.VirtualSimGenerator.Plan;
import com.flexable.web.virtualsim.VirtualSimGenerator.Planned;
import com.flexable.web.virtualsim.VirtualSimRuleset.CategoryStats;
import com.flexable.web.virtualsim.VirtualSimStore.Company;

/**
 * 가상 시뮬레이션 세션(decisions/2026-11-04-virtual-simulation 2·6·7·9, policies §8). 과거 시장 연습(PracticeService)과 같은 방식으로
 * 서버 메모리에만 두고(30분 절대 만료, 1분 간격 정리, 최대 1,000세션, 과거 시장 연습과 따로 셈), startId·commandId로 중복을 막는다.
 * 시작할 때 최신 룰셋과 고른 가상 회사의 글을 복사하고 시드로 구간·사건·OHLC를 한 번에 만든다. 시드는 응답·로그에 넣지 않는다.
 * VIRTUAL_SIM_SOURCE=fake면 예시 룰셋·예시 회사만, 아니면 실제 것만 쓴다(한 실행에 섞지 않음). 세션 시작에서 AI를 부르지 않는다.
 * 대회 판(decisions/2026-11-05-virtual-sim-contest 3-8)도 같은 세션으로 진행한다. VirtualContestService가 판을 만들어 넣고(startContest),
 * 매매 제출·완주·종료·만료를 RoundListener로 알려 DB의 판 기록을 바꾸게 한다. 일반·대회 판 모두 채점하지 않는다(outcome·trendOutcome null).
 */
@Service
@EnableScheduling
public class VirtualSimService {

	static final String NOTICE = "가상 종목·가상 사건이며 실제 기업이 아니에요. 회사 이름·소개·사건 문장은 AI가 만들었고 사람이 검수하지 않았어요. 사건 제목은 실제 공시 제목 형식이고 글에는 좋고 나쁨을 담지 않았어요. 채점하지 않고, 사건마다 공시 직후와 그다음 주 움직임, 같은 유형 공시의 과거 통계를 보여 줘요. 가격은 실제 시장 통계로 만든 가상 움직임이고, 사건 날과 그 뒤 5거래일 움직임은 같은 유형의 과거 공시 당일과 그 뒤 움직임에서 무작위로 뽑았어요. 시장 전체가 오르내린 몫은 빼지 않았어요. 통계는 시가총액 상위 수집 종목의 최근 5년 공시로 만들어 시장 전체를 대표하지 않아요. 앞으로의 수익을 뜻하지 않고 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.";
	static final String SAMPLE_NOTICE = "학습용 예시 자료로 만든 가상 종목·가상 사건이며 실제 기업이 아니에요. 회사 이름·소개·사건 문장은 정해진 틀로 만든 예시이고, 가격은 실제 시장 통계가 아닌 학습용 예시 통계로 만든 가상 움직임이에요. 사건 날과 그 뒤 움직임은 예시 통계에서 무작위로 뽑았고, 채점하지 않아요. 앞으로의 수익을 뜻하지 않고 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.";
	static final String CONTEST_NOTICE = "가상 종목·가상 사건이며 실제 기업이 아니에요. 회사 이름·소개·사건 문장은 AI가 만들었고 사람이 검수하지 않았어요. 사건 제목은 실제 공시 제목 형식이고 글에는 좋고 나쁨을 담지 않았어요. 대회 판은 채점하지 않고, 판이 끝난 잔액과 하루 목표 점수로만 겨뤄요. 가격은 실제 시장 통계로 만든 가상 움직임이고, 사건 날과 그 뒤 5거래일 움직임은 같은 유형의 과거 공시 당일과 그 뒤 움직임에서 무작위로 뽑았어요. 통계는 시가총액 상위 수집 종목의 최근 5년 공시로 만들어 시장 전체를 대표하지 않아요. 대회 순위·점수는 앞으로의 수익을 뜻하지 않고 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.";
	static final String CONTEST_SAMPLE_NOTICE = "학습용 예시 자료로 만든 가상 종목·가상 사건이며 실제 기업이 아니에요. 회사 이름·소개·사건 문장은 정해진 틀로 만든 예시이고, 가격은 실제 시장 통계가 아닌 학습용 예시 통계로 만든 가상 움직임이에요. 대회 판은 채점하지 않고, 판이 끝난 잔액과 하루 목표 점수로만 겨뤄요. 대회 순위·점수는 앞으로의 수익을 뜻하지 않고 투자 권유가 아니에요. 배당·세금·수수료는 제외했어요.";
	private static final Logger log = LoggerFactory.getLogger(VirtualSimService.class);
	private static final ZoneId SEOUL = ZoneId.of("Asia/Seoul");
	private static final int MAX_COMMANDS = 128;
	/** 초까지 쓰는 날짜·시각(계약 date-time) */
	private static final DateTimeFormatter DATE_TIME = DateTimeFormatter.ofPattern("yyyy-MM-dd'T'HH:mm:ssXXX");

	private final VirtualSimStore store;
	private final VirtualSimStartLimiter limiter;
	private final Clock clock;
	private final boolean sample;
	private final int capacity;
	private final SecureRandom random = new SecureRandom();
	private final Map<String, Session> sessions = new HashMap<>();
	private final Map<UUID, String> starts = new HashMap<>();
	/** 대회 판 번호 → 세션 토큰 */
	private final Map<Long, String> contestTokens = new HashMap<>();
	private RoundListener listener;

	public VirtualSimService(VirtualSimStore store, VirtualSimStartLimiter limiter, Clock clock,
			@Value("${app.ingest.virtual-sim.source:gemini}") String source, @Value("${app.virtual-sim.capacity:1000}") int capacity) {
		this.store = store;
		this.limiter = limiter;
		this.clock = clock;
		this.sample = "fake".equals(source);
		this.capacity = capacity;
	}

	private record Saved(Object input, Snapshot snapshot) {
	}

	/** 대회 판 세션과 DB 판 기록의 연결. closesAt: 대회 마감 시각(지나면 step·decision은 409 CONTEST_CLOSED) */
	record ContestLink(long roundId, String contestId, VirtualContestBoard board, int roundNumber, Instant closesAt) {
	}

	/**
	 * 대회 판의 매매 제출·완주·종료를 대회 쪽에 알린다. onOrder는 세션을 바꾸기 전에 불러 저장에 실패하면 선택을 받지 않는다.
	 * event: 판 안 사건 순서(0부터), reason: ENDED(/virtual-sim/end) | EXPIRED(30분 만료)
	 */
	interface RoundListener {
		void onOrder(long roundId, int event, Action action, long quantity);

		void onFinished(long roundId);

		void onEnded(long roundId, String reason);
	}

	/** 판정에 쓰는 사건 하나: 사건 봉 위치와 복사해 둔 유형 통계 */
	private record Question(Planned planned, String id, String body, CategoryStats stats) {
	}

	private static final class Session {
		final Start input;
		final Instant expires;
		final Company company;
		final VirtualSimRuleset rules;
		final List<Candle> candles;
		final List<Question> questions = new ArrayList<>();
		final Map<UUID, Saved> commands = new HashMap<>();
		final List<Result> decisions = new ArrayList<>();
		final List<Integer> decisionIndices = new ArrayList<>();
		final Snapshot first;
		final ContestLink contest;
		int index = 0, version = 0;
		PracticeEngine.Holding holding;

		Session(Start input, Instant expires, Company company, VirtualSimRuleset rules, Plan plan) {
			this(input, expires, company, rules, plan, null);
		}

		Session(Start input, Instant expires, Company company, VirtualSimRuleset rules, Plan plan, ContestLink contest) {
			this.input = input;
			this.contest = contest;
			this.expires = expires;
			this.company = company;
			this.rules = rules;
			this.candles = plan.candles();
			for (int k = 0; k < plan.events().size(); k++) {
				Planned p = plan.events().get(k);
				questions.add(new Question(p, "ve" + (k + 1), company.bodies().get(p.category()), rules.stats(p.category()).orElseThrow()));
			}
			holding = PracticeEngine.trade(new PracticeEngine.Holding(input.initialAmount().longValueExact(), 0), Action.BUY, 50, candles.getFirst().open())
				.holding();
			first = snapshot(this, List.of());
		}
	}

	/** 대회 서비스가 자신을 붙인다(대회 판 기록 갱신) */
	void attach(RoundListener listener) {
		this.listener = listener;
	}

	/** 룰셋. fake면 코드에 넣은 예시 룰셋 */
	private Optional<VirtualSimRuleset> rules() {
		return sample ? Optional.of(VirtualSimSample.ruleset()) : store.latestRuleset(false);
	}

	/** 예시 자료(VIRTUAL_SIM_SOURCE=fake)로만 도는지 */
	boolean sample() {
		return sample;
	}

	/** 공개 가능한 사건(지금 룰셋에 있는 유형)이 3개 이상인 회사(11-10부터 경향 있는 유형 수는 보지 않는다. 대회 판은 판 규칙으로 따로 거른다) */
	private List<Company> candidates(VirtualSimRuleset rules) {
		return store.companies(sample, VirtualSimChecker.VERSION).stream()
			.filter(c -> c.bodies().keySet().stream().map(rules::stats).flatMap(Optional::stream).count() >= VirtualSimGenerator.MIN_QUESTIONS)
			.toList();
	}

	public Status status() {
		return new Status(rules().map(r -> !candidates(r).isEmpty()).orElse(false), sample);
	}

	/** client: 시작 횟수를 세는 클라이언트 값(접속 IP). 메모리에서 10분만 센다(VirtualSimStartLimiter) */
	public synchronized Started start(Start input, String client) {
		clean();
		String prior = starts.get(input.startId());
		if (prior != null) {
			Session s = sessions.get(prior);
			if (!s.input.equals(input)) {
				throw conflict();
			}
			return started(prior, s);
		}
		limiter.check(client);
		if (sessions.size() >= capacity) {
			throw new ApiException(ErrorCode.PRACTICE_CAPACITY);
		}
		VirtualSimRuleset rules = rules().orElseThrow(() -> new ApiException(ErrorCode.PRACTICE_UNAVAILABLE));
		List<Company> choices = candidates(rules);
		if (choices.isEmpty()) {
			throw new ApiException(ErrorCode.PRACTICE_UNAVAILABLE);
		}
		Company company = choices.get(random.nextInt(choices.size()));
		Plan plan = VirtualSimGenerator.generate(random.nextLong(), rules, company.bodies().keySet(), LocalDate.now(clock.withZone(SEOUL)));
		Session session = new Session(input, clock.instant().plusSeconds(1800), company, rules, plan);
		byte[] bytes = new byte[32];
		random.nextBytes(bytes);
		String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		sessions.put(token, session);
		starts.put(input.startId(), token);
		limiter.recordFailure(client);
		return started(token, session);
	}

	private static Started started(String token, Session s) {
		return new Started(token, DATE_TIME.format(s.expires.atOffset(ZoneOffset.ofHours(9))), s.first);
	}

	@Scheduled(fixedDelay = 60000)
	public synchronized void clean() {
		var expired = sessions.entrySet().stream().filter(e -> !clock.instant().isBefore(e.getValue().expires)).map(Map.Entry::getKey).toList();
		expired.forEach(token -> remove(token, "EXPIRED"));
	}

	private synchronized Session session(String token) {
		clean();
		Session s = sessions.get(token);
		if (s == null) {
			throw new ApiException(ErrorCode.PRACTICE_EXPIRED);
		}
		return s;
	}

	public synchronized void end(String token) {
		remove(token, "ENDED");
	}

	/** 세션을 지운다. 대회 판이면 대회 쪽이 남은 사건을 유지로 끝까지 돌려 정산한다(결정 기록 5-2) */
	private void remove(String token, String reason) {
		Session s = sessions.remove(token);
		if (s == null) {
			return;
		}
		if (s.contest == null) {
			starts.remove(s.input.startId());
			return;
		}
		contestTokens.remove(s.contest.roundId());
		if (listener != null) {
			try {
				listener.onEnded(s.contest.roundId(), reason);
			}
			catch (RuntimeException e) {
				// 정리 작업이 세션 없는 진행 중 판으로 다시 정산한다
				log.error("대회 판 정산 실패 round={}", s.contest.roundId(), e);
			}
		}
	}

	// ───────── 대회 판(VirtualContestService가 같은 잠금 안에서 부른다) ─────────

	synchronized boolean hasCapacity() {
		clean();
		return sessions.size() < capacity;
	}

	/** 대회 판 세션을 만든다. 시드·회사·룰셋·계획은 대회 쪽이 DB에 둔 값으로 만든 것 */
	synchronized Started startContest(ContestLink link, long initial, VirtualSimRuleset rules, Company company, Plan plan, Instant expires) {
		if (sessions.size() >= capacity) {
			throw new ApiException(ErrorCode.PRACTICE_CAPACITY);
		}
		Session session = new Session(new Start(UUID.randomUUID(), BigDecimal.valueOf(initial)), expires, company, rules, plan, link);
		byte[] bytes = new byte[32];
		random.nextBytes(bytes);
		String token = Base64.getUrlEncoder().withoutPadding().encodeToString(bytes);
		sessions.put(token, session);
		contestTokens.put(link.roundId(), token);
		return started(token, session);
	}

	/** 살아 있는 대회 판 세션의 시작 응답(같은 startId 재전송) */
	synchronized Optional<Started> contestStarted(long roundId) {
		clean();
		String token = contestTokens.get(roundId);
		return token == null ? Optional.empty() : Optional.of(started(token, sessions.get(token)));
	}

	/** 메모리에 세션이 있는 대회 판 번호 */
	synchronized Set<Long> contestRounds() {
		return Set.copyOf(contestTokens.keySet());
	}

	/** 대회 쪽이 직접 정산하는 판(새 판 시작·마감·탈퇴)의 세션을 알림 없이 지운다 */
	synchronized void dropContest(long roundId) {
		String token = contestTokens.remove(roundId);
		if (token != null) {
			sessions.remove(token);
		}
	}

	private void closed(Session s) {
		if (s.contest != null && !clock.instant().isBefore(s.contest.closesAt())) {
			throw new ApiException(ErrorCode.CONTEST_CLOSED);
		}
	}

	public synchronized Snapshot state(String token) {
		return snapshot(session(token), List.of());
	}

	private static ApiException conflict() {
		return new ApiException(ErrorCode.PRACTICE_CONFLICT);
	}

	private static Snapshot replay(Session s, UUID id, int version, Object input) {
		Saved saved = s.commands.get(id);
		if (saved != null) {
			if (!saved.input().equals(input)) {
				throw conflict();
			}
			return saved.snapshot();
		}
		if (s.version != version || s.commands.size() >= MAX_COMMANDS) {
			throw conflict();
		}
		return null;
	}

	public synchronized Snapshot step(Command input) {
		Session s = session(input.sessionToken());
		Snapshot old = replay(s, input.commandId(), input.expectedVersion(), input);
		if (old != null) {
			return old;
		}
		closed(s);
		if (!status(s).equals("RUNNING")) {
			throw conflict();
		}
		// 다음 사건 또는 마지막 봉까지 한 번에 진행하고, 화면이 하루씩 그리도록 날마다의 자산을 함께 준다
		List<Frame> frames = new ArrayList<>();
		do {
			advance(s);
			Candle candle = s.candles.get(s.index);
			frames.add(new Frame(candle.date(), PracticeEngine.value(s.holding, candle.close(), s.input.initialAmount().longValueExact())));
		}
		while (status(s).equals("RUNNING"));
		Snapshot result = save(s, input.commandId(), input, frames);
		if (s.contest != null && "FINISHED".equals(result.status()) && listener != null) {
			try {
				listener.onFinished(s.contest.roundId());
			}
			catch (RuntimeException e) {
				// 세션이 끝날 때(종료·만료) 다시 정산한다
				log.error("대회 판 완주 정산 실패 round={}", s.contest.roundId(), e);
			}
		}
		return result;
	}

	private static void advance(Session s) {
		s.index++;
		Candle candle = s.candles.get(s.index);
		for (int n = 0; n < s.decisions.size(); n++) {
			Result r = s.decisions.get(n);
			if ("PENDING".equals(r.execution())) {
				var trade = trade(s.holding, r.action(), r.quantity(), candle.open());
				s.holding = trade.holding();
				r = new Result(r.eventId(), r.category(), r.categoryName(), r.title(), r.date(), r.prediction(), r.action(), r.quantity(),
						r.action() == Action.HOLD ? "HOLD" : trade.shares() == 0 ? "NO_FILL" : "FILLED", candle.date(), candle.open(), trade.shares(), null,
						null, null, null, null, null, null, null, null, null, null);
			}
			int baseline = s.decisionIndices.get(n);
			if (s.index == baseline + VirtualSimRules.FOLLOW_DAYS) {
				long price = s.candles.get(baseline).close();
				// 공시 직후 = 사건 봉 전날 종가 → 다음 봉 종가, 그다음 주 = 다음 봉 종가 → 5번째 후속 봉 종가(11-10, 배치고사 결과와 같은 두 구간)
				long prev = s.candles.get(baseline - 1).close(), next = s.candles.get(baseline + 1).close();
				String eventId = r.eventId();
				CategoryStats stats = s.questions.stream().filter(q -> q.id().equals(eventId)).findFirst().orElseThrow().stats();
				// 일반·대회 모두 채점하지 않는다(policies §8-6, 11-05): 이번 결과·경향 채점은 null, 이번 움직임·유형 통계는 보인다
				r = new Result(r.eventId(), r.category(), r.categoryName(), r.title(), r.date(), r.prediction(), r.action(), r.quantity(),
						r.execution(), r.executedDate(), r.executedPrice(), r.executedShares(), null, candle.date(),
						PracticeEngine.rate(candle.close() - price, price), PracticeEngine.rate(next - prev, prev), PracticeEngine.rate(candle.close() - next, next),
						movement(prev, next), stats.upShare(), VirtualSimRules.upShare(stats.paths(), stats.down()), stats.paths(), stats.trend(), null);
			}
			s.decisions.set(n, r);
		}
	}

	/** 매매 방향의 예상: 매수는 오른다, 매도는 내린다, 유지는 예상 없음. 채점에는 쓰지 않는다 */
	static Prediction prediction(Action action) {
		return switch (action) {
			case BUY -> Prediction.POSITIVE;
			case SELL -> Prediction.NEGATIVE;
			case HOLD -> null;
		};
	}

	/** 가상 등락의 방향(원 가격 비교). 판정 뒤 movement는 공시 직후(사건 봉 전날 종가 → 다음 봉 종가) */
	static String movement(long baseline, long after) {
		return after > baseline ? "UP" : after < baseline ? "DOWN" : "FLAT";
	}

	/**
	 * 요청 수량으로 다음 봉 시가에 정수 주 체결(policies §8 "매매"). 매수는 그 시가로 지금 현금에 살 수 있는 만큼까지(부분 체결),
	 * 매도는 보유 수량까지. 0주면 미체결. 현금 보존·초과 매도 금지는 PracticeEngine과 같다.
	 */
	static PracticeEngine.Trade trade(PracticeEngine.Holding h, Action action, long quantity, long price) {
		if (price <= 0 || quantity < 0) {
			throw new IllegalArgumentException();
		}
		return switch (action) {
			case BUY -> {
				long n = Math.min(quantity, h.cash() / price);
				yield new PracticeEngine.Trade(new PracticeEngine.Holding(h.cash() - Math.multiplyExact(n, price), Math.addExact(h.shares(), n)), n);
			}
			case SELL -> {
				long n = Math.min(quantity, h.shares());
				yield new PracticeEngine.Trade(new PracticeEngine.Holding(Math.addExact(h.cash(), Math.multiplyExact(n, price)), h.shares() - n), n);
			}
			case HOLD -> new PracticeEngine.Trade(h, 0);
		};
	}

	/** 수량 입력 상한: 기준 가격(지금 종가)과 그 가격에 지금 현금으로 살 수 있는 수량, 보유 수량 */
	static OrderLimits limits(PracticeEngine.Holding h, long close) {
		return new OrderLimits(close, h.cash() / close, h.shares());
	}

	public synchronized Snapshot decide(Decision input) {
		if (input.action() == Action.HOLD ? input.quantity() != 0 : input.quantity() < 1) {
			throw ApiException.invalid("quantity", "매매 수량을 확인해 주세요");
		}
		Session s = session(input.sessionToken());
		Snapshot old = replay(s, input.commandId(), input.expectedVersion(), input);
		if (old != null) {
			return old;
		}
		closed(s);
		Question q = current(s);
		if (q == null || !q.id().equals(input.eventId())) {
			throw conflict();
		}
		OrderLimits limit = limits(s.holding, s.candles.get(s.index).close());
		if (input.action() == Action.BUY && input.quantity() > limit.maxBuyShares() || input.action() == Action.SELL && input.quantity() > limit.maxSellShares()) {
			throw ApiException.invalid("quantity", input.action() == Action.BUY ? "지금 현금으로 살 수 있는 수량을 넘었어요" : "보유 수량보다 많이 팔 수 없어요");
		}
		if (s.contest != null && listener != null) {
			listener.onOrder(s.contest.roundId(), s.questions.indexOf(q), input.action(), input.quantity());
		}
		Planned p = q.planned();
		s.decisions.add(new Result(q.id(), p.category(), p.category().displayName(), p.title(), s.candles.get(s.index).date(), prediction(input.action()),
				input.action(), input.quantity(), "PENDING", null, null, null, null, null, null, null, null, null, null, null, null, null, null));
		s.decisionIndices.add(s.index);
		return save(s, input.commandId(), input, List.of());
	}

	private static Snapshot save(Session s, UUID id, Object input, List<Frame> frames) {
		s.version++;
		Snapshot result = snapshot(s, frames);
		s.commands.put(id, new Saved(input, result));
		return result;
	}

	private static Question current(Session s) {
		return s.questions.stream()
			.filter(q -> q.planned().index() == s.index)
			.filter(q -> s.decisions.stream().noneMatch(r -> r.eventId().equals(q.id())))
			.findFirst()
			.orElse(null);
	}

	private static String status(Session s) {
		return current(s) != null ? "AWAITING_DECISION" : s.index == s.candles.size() - 1 ? "FINISHED" : "RUNNING";
	}

	private static Snapshot snapshot(Session s, List<Frame> frames) {
		long initial = s.input.initialAmount().longValueExact();
		Question q = current(s);
		Event event = q == null ? null
				: new Event(q.id(), q.planned().category(), q.planned().category().displayName(), q.planned().title(), q.body(),
						s.candles.get(s.index).date(), limits(s.holding, s.candles.get(s.index).close()));
		Company c = s.company;
		boolean sample = s.rules.isSample();
		List<String> sources = new ArrayList<>(s.rules.sources());
		if (!sample) {
			sources.add("Google Gemini(가상 회사·사건 글)");
		}
		String status = status(s);
		var portfolio = PracticeEngine.value(s.holding, s.candles.get(s.index).close(), initial);
		ContestRound contest = null;
		if (s.contest != null) {
			boolean done = "FINISHED".equals(status);
			// 끝난 판은 같은 봉에서 유지만 했을 때와 비교한 값도 준다(정산과 같은 계산)
			Long hold = done ? VirtualContestRules.play(s.candles, initial, Map.of()).total() : null;
			contest = new ContestRound(s.contest.contestId(), s.contest.board(), s.contest.roundNumber(), done ? portfolio.total() : null, hold,
					done ? VirtualContestRules.rate(hold, initial) : null, done ? VirtualContestRules.excess(initial, portfolio.total(), hold) : null);
		}
		String notice = s.contest == null ? sample ? SAMPLE_NOTICE : NOTICE : sample ? CONTEST_SAMPLE_NOTICE : CONTEST_NOTICE;
		return new Snapshot(s.version, status, new VirtualSimDtos.Company(c.name(), c.industry(), c.intro()),
				new Generator(!c.sample(), c.model(), DATE_TIME.format(c.generatedAt().atOffset(ZoneOffset.ofHours(9)))),
				new RulesetInfo(s.rules.version(), s.rules.dataFrom(), s.rules.dataTo()), initial, sample, contest, s.candles.size(),
				List.copyOf(s.candles.subList(0, s.index + 1)), List.copyOf(frames), portfolio, event, List.copyOf(s.decisions), notice,
				List.copyOf(sources));
	}
}
