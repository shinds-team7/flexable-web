package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.math.BigDecimal;
import java.nio.file.Files;
import java.nio.file.Path;
import java.time.LocalDate;
import java.time.OffsetDateTime;
import java.time.YearMonth;
import java.util.ArrayList;
import java.util.EnumSet;
import java.util.HashMap;
import java.util.List;
import java.util.Map;
import java.util.Set;

import org.junit.jupiter.api.Test;

import com.flexable.web.market.PracticeMarketData.Candle;
import com.flexable.web.practice.PracticeDtos.Action;
import com.flexable.web.practice.PracticeDtos.Portfolio;
import com.flexable.web.practice.PracticeDtos.Prediction;
import com.flexable.web.practice.PracticeEngine;
import com.flexable.web.virtualsim.VirtualContestRules.Order;
import com.flexable.web.virtualsim.VirtualContestRules.Standing;
import com.flexable.web.virtualsim.VirtualSimGenerator.Plan;
import com.flexable.web.virtualsim.VirtualSimGenerator.Planned;

import tools.jackson.databind.JsonNode;
import tools.jackson.databind.json.JsonMapper;

/** docs/policies.md §8-8 예시 표 = tests/policy/virtual-contest.json. 표를 고치면 이 테스트가 대회 규칙 코드와 맞는지 확인한다. */
class VirtualContestPolicyTest {

	private static JsonNode root() throws Exception {
		return JsonMapper.builder().build().readTree(Files.readString(Path.of("..", "tests", "policy", "virtual-contest.json")));
	}

	@Test
	void status_and_rules() throws Exception {
		JsonNode r = root();
		assertThat(r.get("status").asString()).isEqualTo("IMPLEMENTED");
		JsonNode rules = r.get("rules");
		assertThat(VirtualContestRules.EVENTS).isEqualTo(rules.get("eventsPerRound").asInt());
		assertThat(VirtualContestRules.ROUND_LENGTH).isEqualTo(rules.get("roundLength").asInt());
		assertThat(VirtualSimGenerator.SUPPORTED).containsExactlyInAnyOrderElementsOf(rules.get("supportedGeneratorVersions").valueStream().map(JsonNode::asString).toList());
		assertThat(VirtualContestRules.ROUNDS_PER_DAY).isEqualTo(rules.get("roundsPerDay").asInt());
		assertThat(VirtualContestRules.LIQUIDATION_BELOW).isEqualTo(rules.get("liquidationBelow").asLong());
		assertThat(VirtualContestRules.RANKING_TOP).isEqualTo(rules.get("rankingTop").asInt());
		assertThat(VirtualContestRules.RETENTION_MONTHS).isEqualTo(rules.get("retentionMonths").asInt());
		assertThat(VirtualContestRules.PLACEMENT_QUESTIONS).isEqualTo(rules.get("placementQuestions").asInt());
		assertThat(VirtualContestRules.PLACEMENT_MINUTES).isEqualTo(rules.get("placementMinutes").asInt());
		assertThat(VirtualContestRules.DAILY_TARGET).isEqualByComparingTo(new BigDecimal(rules.get("dailyTargetRate").asString()));
		assertThat(VirtualContestRules.PROMOTE_AT).isEqualTo(rules.get("weeklyPromoteAt").asInt());
		assertThat(VirtualContestRules.DEMOTE_AT).isEqualTo(rules.get("weeklyDemoteAt").asInt());
		assertThat(VirtualSimGenerator.VERSION).isEqualTo(rules.get("generatorVersion").asString());
		assertThat(VirtualSimGenerator.SUPPORTED).contains(VirtualSimGenerator.VERSION);
		JsonNode cuts = r.get("provisional").get("placementCuts");
		assertThat(VirtualContestRules.CUT_B50M).isEqualTo(cuts.get("B50M").asInt());
		assertThat(VirtualContestRules.CUT_B100M).isEqualTo(cuts.get("B100M").asInt());
	}

	@Test
	void weeks() throws Exception {
		JsonNode w = root().get("rules").get("weeks");
		// 늘 네 주이고 4주차는 22일~말일(31일 달 10일, 30일 달 9일, 평년 2월 7일, 윤년 2월 8일)
		for (YearMonth m : List.of(YearMonth.of(2026, 12), YearMonth.of(2026, 11), YearMonth.of(2027, 2), YearMonth.of(2028, 2))) {
			List<LocalDate[]> weeks = VirtualContestRules.weeks(m);
			assertThat(weeks).hasSize(w.size()).hasSize(VirtualContestRules.WEEKS);
			for (int i = 0; i < weeks.size(); i++) {
				assertThat(weeks.get(i)[0].getDayOfMonth()).isEqualTo(w.get(i).get(0).asInt());
				assertThat(weeks.get(i)[1].getDayOfMonth()).isEqualTo(Math.min(w.get(i).get(1).asInt(), m.lengthOfMonth()));
				for (LocalDate d = weeks.get(i)[0]; !d.isAfter(weeks.get(i)[1]); d = d.plusDays(1)) {
					assertThat(VirtualContestRules.weekOf(d)).isEqualTo(i + 1);
					assertThat(VirtualContestRules.weekEnd(d)).isEqualTo(weeks.get(i)[1]);
				}
			}
		}
	}

	@Test
	void boards() throws Exception {
		for (JsonNode b : root().get("boards")) {
			VirtualContestBoard board = VirtualContestBoard.valueOf(b.get("board").asString());
			assertThat(board.seedMoney()).isEqualTo(b.get("seedMoney").asLong());
			assertThat(board.grades()).containsExactly(b.get("volatilityGrades").valueStream().mapToInt(JsonNode::asInt).toArray());
			assertThat(board.clear()).isEqualTo(b.get("first").get("clear").asInt());
			assertThat(board.mixed()).isEqualTo(b.get("first").get("mixed").asInt());
		}
	}

	@Test
	void placement() throws Exception {
		JsonNode p = root().get("placement");
		for (JsonNode c : p.get("cases")) {
			assertThat(VirtualContestRules.placementBoard(c.get("correct").asInt())).as(c.toString()).isEqualTo(VirtualContestBoard.valueOf(c.get("expected").asString()));
		}
		assertThat(VirtualContestQuestions.EVIDENCE).isEqualTo(p.get("composition").get("evidence").asInt());
		assertThat(VirtualContestQuestions.ANY).isEqualTo(p.get("composition").get("any").asInt());
		assertThat(VirtualContestQuestions.EVIDENCE + VirtualContestQuestions.ANY).isEqualTo(VirtualContestRules.PLACEMENT_QUESTIONS);
		assertThat(VirtualContestQuestions.EVIDENCE_TYPES.stream().map(Enum::name).sorted().toList())
			.isEqualTo(p.get("evidenceTypes").valueStream().map(JsonNode::asString).sorted().toList());
		// 정답 = 공시 직후(전날 종가 → 다음 거래일 종가) 방향, 그다음 주(다음 거래일 종가 → 5번째 후속 거래일 종가)는 결과에만
		for (JsonNode c : p.get("grading")) {
			Prediction pr = c.get("prediction").isNull() ? null : Prediction.valueOf(c.get("prediction").asString());
			var q = new VirtualContestQuestions.Past("k", "회사", "업종", VirtualSimCategory.SUPPLY_CONTRACT, "t", null, null, null, c.get("prevClose").asLong(),
					c.get("nextClose").asLong(), c.get("afterClose").asLong());
			assertThat(VirtualContestRules.placementCorrect(q.up(), pr)).as(c.toString()).isEqualTo(c.get("correct").asBoolean());
			assertThat(q.reactionRate()).as(c.toString()).isEqualByComparingTo(c.get("reactionReturnRate").asString());
			assertThat(q.nextWeekRate()).as(c.toString()).isEqualByComparingTo(c.get("nextWeekReturnRate").asString());
		}
		// 공시 직후가 보합인 공시는 문제로 쓰지 않는다(5거래일 뒤가 달라도). 분류되지 않는 제목·기준 봉 전날이나 후속 5거래일이 없는 공시도 뺀다
		JsonNode flat = p.get("flatExcluded");
		List<LocalDate> dates = new ArrayList<>();
		List<Long> closes = new ArrayList<>();
		for (int i = 0; i < 9; i++) {
			dates.add(LocalDate.of(2026, 3, 2).plusDays(i));
			closes.add(i == 6 ? flat.get("afterClose").asLong() : i == 2 ? flat.get("nextClose").asLong() : flat.get("prevClose").asLong());
		}
		closes.set(4, flat.get("prevClose").asLong() + 100);
		var made = VirtualContestQuestions.fromFilings("회사", "업종", List.of(new VirtualContestQuestions.Filing("1", "주요사항보고서(유상증자결정)", dates.get(1)),
				new VirtualContestQuestions.Filing("2", "주요사항보고서(유상증자결정)", dates.get(0)), new VirtualContestQuestions.Filing("3", "임원ㆍ주요주주특정증권등소유상황보고서", dates.get(3)),
				new VirtualContestQuestions.Filing("4", "주요사항보고서(유상증자결정)", dates.get(4)), new VirtualContestQuestions.Filing("5", "주요사항보고서(유상증자결정)", dates.get(3))),
				dates, closes);
		// 1번(전날 → 다음 거래일이 10,000 → 10,000, 5번째 뒤는 10,300)은 보합이라 빠지고, 2번은 전날 봉이 없고, 3번은 분류되지 않는 제목, 4번은 후속 5거래일이 없다.
		// 5번(전날 10,000 → 다음 거래일 10,100)만 남는다
		assertThat(made).extracting(VirtualContestQuestions.Past::key).containsExactly("5");
		assertThat(made.get(0).up()).isTrue();
	}

	/** 출제: 묶음마다 설명(공시 AI 요약·주요 내용)이 있는 공시를 먼저 고르고, 모자라면 설명이 없는 공시로 채운다 */
	@Test
	void placement_draw_prefers_described() {
		List<VirtualContestQuestions.Past> pool = new ArrayList<>();
		java.util.function.BiFunction<String, VirtualSimCategory, VirtualContestQuestions.Past> past = (k, c) -> new VirtualContestQuestions.Past(k, "회사", "업종", c, "t",
				null, null, null, 100, 110, 120);
		for (int i = 0; i < 20; i++) {
			pool.add(past.apply("ev-plain-" + i, VirtualSimCategory.FACILITY));
			pool.add(past.apply("any-plain-" + i, VirtualSimCategory.EARNINGS));
		}
		for (int i = 0; i < 6; i++) {
			pool.add(past.apply("any-sum-" + i, VirtualSimCategory.DIVIDEND));
		}
		pool.add(past.apply("ev-sum-0", VirtualSimCategory.SUPPLY_CONTRACT));
		pool.add(past.apply("ev-sum-1", VirtualSimCategory.BUYBACK_ACQUIRE));
		Set<String> summarized = new java.util.HashSet<>(List.of("ev-sum-0", "ev-sum-1"));
		for (int i = 0; i < 6; i++) {
			summarized.add("any-sum-" + i);
		}
		for (long seed = 1; seed <= 20; seed++) {
			List<String> keys = VirtualContestQuestions.draw(pool, summarized, new java.util.Random(seed)).stream().map(VirtualContestQuestions.Past::key).toList();
			assertThat(keys).hasSize(10).doesNotHaveDuplicates();
			// 근거 유형 4개: 설명 있는 2개를 먼저, 모자란 2개는 설명 없는 근거 유형. 나머지 6개는 설명 있는 공시 6개
			assertThat(keys).contains("ev-sum-0", "ev-sum-1");
			assertThat(keys.stream().filter(k -> k.startsWith("ev-plain-"))).hasSize(2);
			assertThat(keys.stream().filter(k -> k.startsWith("any-sum-"))).hasSize(6);
		}
	}

	@Test
	void candidates() throws Exception {
		for (JsonNode c : root().get("candidates").get("cases")) {
			List<String> trends = c.get("trends").valueStream().map(JsonNode::asString).toList();
			for (VirtualContestBoard b : VirtualContestBoard.values()) {
				assertThat(VirtualContestRules.candidate(trends, b)).as(c + " " + b).isEqualTo(c.get("expected").get(b.name()).asBoolean());
			}
		}
	}

	/** 판별 출제: 사건 4개 고정, 유형은 서로 다르고 먼저 뽑는 유형을 채우며, 시드가 같으면 같은 판 */
	@Test
	void board_generation() throws Exception {
		VirtualSimRuleset rules = VirtualSimSample.ruleset();
		Set<VirtualSimCategory> all = EnumSet.of(VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.BUYBACK_ACQUIRE, VirtualSimCategory.NEW_SHARES,
				VirtualSimCategory.EARNINGS, VirtualSimCategory.DIVIDEND);
		LocalDate session = LocalDate.of(2026, 11, 5);
		for (VirtualContestBoard b : VirtualContestBoard.values()) {
			for (long seed = 1; seed <= 200; seed++) {
				Plan plan = VirtualSimGenerator.generate(seed, rules, all, session, b.rule());
				assertThat(plan.events()).hasSize(VirtualContestRules.EVENTS);
				List<VirtualSimCategory> cats = plan.events().stream().map(Planned::category).toList();
				assertThat(Set.copyOf(cats)).hasSize(VirtualContestRules.EVENTS);
				long clear = cats.stream().filter(c -> rules.stats(c).orElseThrow().clear()).count();
				assertThat(clear).as("%s seed %d", b, seed).isGreaterThanOrEqualTo(b.clear());
				assertThat(VirtualContestRules.EVENTS - clear).as("%s seed %d", b, seed).isGreaterThanOrEqualTo(b.mixed());
				// v2: 120거래일 고정. v1(이전 판 정산용)은 120~250에서 뽑는다
				assertThat(plan.candles()).hasSize(VirtualContestRules.ROUND_LENGTH);
				assertThat(VirtualSimGenerator.generate(seed, rules, all, session, b.rule())).usingRecursiveComparison().isEqualTo(plan);
				Plan v1 = VirtualSimGenerator.generate(seed, rules, all, session, b.rule(VirtualSimGenerator.V1));
				assertThat(v1.candles().size()).isBetween(com.flexable.web.market.PracticeWindow.MIN_LENGTH, com.flexable.web.market.PracticeWindow.MAX_LENGTH);
				assertThat(v1.events()).hasSize(VirtualContestRules.EVENTS);
			}
		}
	}

	/** 대회 판 규칙을 더해도 일반 유형의 결과는 그대로다. 값은 #253(일반 출제에서 뚜렷한 유형을 먼저 뽑지 않음) 생성기로 같은 입력을 돌려 잰 것. 대회 판의 난수 순서는 바뀌지 않아 생성기 버전은 그대로다 */
	@Test
	void general_generation_unchanged() {
		var all = EnumSet.of(VirtualSimCategory.SUPPLY_CONTRACT, VirtualSimCategory.BUYBACK_ACQUIRE, VirtualSimCategory.NEW_SHARES,
				VirtualSimCategory.EARNINGS, VirtualSimCategory.DIVIDEND);
		long h = 17;
		for (long seed = 1; seed <= 100; seed++) {
			Plan plan = VirtualSimGenerator.generate(seed, VirtualSimSample.ruleset(), all, LocalDate.of(2026, 11, 5));
			for (Candle c : plan.candles()) {
				h = h * 31 + c.date().hashCode() + c.open() * 7 + c.high() * 11 + c.low() * 13 + c.close() * 17;
			}
			for (Planned e : plan.events()) {
				h = h * 31 + e.index() * 101 + e.category().ordinal() + e.title().hashCode();
			}
		}
		assertThat(h).isEqualTo(-7166366154250459648L);
	}

	private static Portfolio play(JsonNode c) {
		// 첫 봉(시가 firstOpen), 사건 매매 체결 봉(시가 fillOpen), 마지막 봉(종가 lastClose)으로 판 하나를 만든다
		List<Candle> candles = new ArrayList<>();
		long first = c.get("firstOpen").asLong();
		candles.add(new Candle("2036-01-02", first, first, first, first));
		Map<Integer, Order> fills = new HashMap<>();
		for (JsonNode o : c.get("orders")) {
			long open = o.get("fillOpen").asLong();
			fills.put(candles.size(), new Order(Action.valueOf(o.get("action").asString()), o.get("quantity").asLong()));
			candles.add(new Candle("2036-01-0" + (candles.size() + 2), open, open, open, open));
		}
		long last = c.get("lastClose").asLong();
		candles.add(new Candle("2036-01-09", last, last, last, last));
		return VirtualContestRules.play(candles, c.get("startBalance").asLong(), fills);
	}

	@Test
	void rounds_carry_balance() throws Exception {
		JsonNode r = root().get("rounds");
		for (JsonNode c : r.get("cases")) {
			VirtualContestBoard board = VirtualContestBoard.valueOf(c.get("board").asString());
			long start = c.get("startBalance").asLong();
			var initial = PracticeEngine.trade(new PracticeEngine.Holding(start, 0), Action.BUY, 50, c.get("firstOpen").asLong()).holding();
			assertThat(initial.shares()).as(c.toString()).isEqualTo(c.get("initialShares").asLong());
			assertThat(initial.cash()).as(c.toString()).isEqualTo(c.get("initialCash").asLong());
			long end = play(c).total();
			assertThat(end).as(c.toString()).isEqualTo(c.get("endBalance").asLong());
			assertThat(VirtualContestRules.liquidated(end)).as(c.toString()).isEqualTo(c.get("liquidated").asBoolean());
			assertThat(VirtualContestRules.rate(end, board.seedMoney())).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("boardReturnRate").asString()));
		}
		for (JsonNode c : r.get("liquidation")) {
			assertThat(VirtualContestRules.liquidated(c.get("balance").asLong())).isEqualTo(c.get("liquidated").asBoolean());
		}
	}

	@Test
	void excess_and_daily_score() throws Exception {
		for (JsonNode c : root().get("excess").get("cases")) {
			JsonNode r = c.get("round");
			assertThat(VirtualContestRules.excess(r.get(0).asLong(), r.get(1).asLong(), r.get(2).asLong())).as(c.toString())
				.isEqualByComparingTo(new BigDecimal(c.get("excessRate").asString()));
		}
		assertThat(VirtualContestRules.ROUNDS_FOR_SCORE).isEqualTo(root().get("rules").get("roundsForDailyScore").asInt());
		for (JsonNode c : root().get("dailyScore").get("cases")) {
			List<BigDecimal> rates = c.get("excessRates").valueStream().map(x -> new BigDecimal(x.asString())).toList();
			BigDecimal rate = VirtualContestRules.dayRate(rates);
			if (c.get("dayReturnRate").isNull()) {
				assertThat(rate).isNull();
			}
			else {
				assertThat(rate).as(c.toString()).isEqualByComparingTo(new BigDecimal(c.get("dayReturnRate").asString()));
			}
			assertThat(VirtualContestRules.dailyPoints(rate, rates.size())).as(c.toString()).isEqualTo(c.get("points").asInt());
		}
	}

	@Test
	void weekly() throws Exception {
		for (JsonNode c : root().get("weekly").get("cases")) {
			int sum = c.get("days").valueStream().mapToInt(JsonNode::asInt).sum();
			assertThat(sum).isEqualTo(c.get("sum").asInt());
			VirtualContestBoard board = VirtualContestBoard.valueOf(c.get("board").asString());
			VirtualContestBoard next = VirtualContestRules.weekly(board, sum);
			if (c.has("finalWeek") && c.get("finalWeek").asBoolean()) {
				// 4주차는 판정 결과만 기록하고 판은 그대로
				assertThat(VirtualContestRules.outcome(board, next).name()).as(c.toString()).isEqualTo(c.get("judged").asString());
				next = board;
			}
			assertThat(next).as(c.toString()).isEqualTo(VirtualContestBoard.valueOf(c.get("nextBoard").asString()));
			long balance = next == board ? c.get("balance").asLong() : next.seedMoney();
			assertThat(balance).as(c.toString()).isEqualTo(c.get("nextBalance").asLong());
		}
	}

	@Test
	void ranking() throws Exception {
		JsonNode r = root().get("ranking");
		Map<Long, String> names = new HashMap<>();
		List<Standing> standings = new ArrayList<>();
		for (JsonNode e : r.get("entries")) {
			names.put(e.get("userId").asLong(), e.get("member").asString());
			standings.add(new Standing(e.get("userId").asLong(), e.get("boardPoints").asInt(), new BigDecimal(e.get("excessRate").asString()),
					OffsetDateTime.parse(e.get("reachedAt").asString()).toInstant(), OffsetDateTime.parse(e.get("joinedAt").asString()).toInstant()));
		}
		List<String> order = standings.stream().sorted(VirtualContestRules.ORDER).map(s -> names.get(s.userId())).toList();
		assertThat(order).containsExactlyElementsOf(r.get("expectedOrder").valueStream().map(JsonNode::asString).toList());
	}

	private static Long longOrNull(JsonNode n) {
		return n == null || n.isNull() ? null : n.asLong();
	}

	private static String textOrNull(JsonNode n) {
		return n == null || n.isNull() ? null : n.asString();
	}

	private static Map<String, String> row(JsonNode n) {
		Map<String, String> m = new HashMap<>();
		n.properties().forEach(e -> m.put(e.getKey(), e.getValue().asString()));
		return m;
	}

	@Test
	void placement_details() throws Exception {
		JsonNode p = root().get("placementDetails");
		assertThat(PlacementDetails.VERSION).isEqualTo(p.get("version").asString());
		assertThat(PlacementDetails.MAX_ITEMS).isEqualTo(p.get("maxItems").asInt());
		for (JsonNode c : p.get("ratio")) {
			assertThat(PlacementDetails.percent(PlacementDetails.ratio(longOrNull(c.get("a")), longOrNull(c.get("b"))))).as(c.toString())
				.isEqualTo(textOrNull(c.get("expected")));
		}
		for (JsonNode c : p.get("reported")) {
			assertThat(PlacementDetails.percent(PlacementDetails.reported(c.get("text").asString()))).as(c.toString()).isEqualTo(textOrNull(c.get("expected")));
		}
		for (JsonNode c : p.get("bucket")) {
			assertThat(PlacementDetails.bucket(longOrNull(c.get("won")))).as(c.toString()).isEqualTo(textOrNull(c.get("expected")));
		}
		for (JsonNode c : p.get("shares")) {
			assertThat(PlacementDetails.shares(row(c.get("row")), PlacementDetails.FUNDS)).as(c.toString()).isEqualTo(textOrNull(c.get("expected")));
		}
		for (JsonNode c : p.get("items")) {
			List<List<String>> expected = c.get("expected").valueStream().map(x -> x.valueStream().map(JsonNode::asString).toList()).toList();
			assertThat(PlacementDetails.items(c.get("api").asString(), row(c.get("row"))).stream().map(d -> List.of(d.label(), d.value())).toList()).as(c.toString())
				.isEqualTo(expected);
		}
		for (JsonNode c : p.get("titles")) {
			assertThat(PlacementDetails.api(c.get("title").asString())).as(c.toString()).isEqualTo(textOrNull(c.get("api")));
		}
		// 공급 계약: 원문 본문 글에서 매출액 대비·계약 기간만(Issue #375)
		JsonNode supply = p.get("supplyContract");
		for (JsonNode c : supply.get("cases")) {
			assertThat(PlacementDetails.supplyContract(c.get("text").asString()).stream().map(d -> List.of(d.label(), d.value())).toList()).as(c.get("case").asString())
				.isEqualTo(pairs(c.get("expected")));
		}
		for (JsonNode c : supply.get("titles")) {
			assertThat(PlacementDetails.fromDocument(c.get("title").asString())).as(c.toString()).isEqualTo(c.get("document").asBoolean());
		}
	}

	private static List<List<String>> pairs(JsonNode n) {
		return n.isNull() ? null : n.valueStream().map(x -> x.valueStream().map(JsonNode::asString).toList()).toList();
	}

	/** 정정 공시는 문제로 내지 않고 원공시에 합친다(Issue #375) */
	@Test
	void placement_corrections() throws Exception {
		JsonNode p = root().get("placement").get("corrections");
		assertThat(VirtualContestQuestions.CORRECTION_DAYS).isEqualTo(p.get("days").asInt());
		for (JsonNode c : p.get("titles")) {
			assertThat(VirtualContestQuestions.correction(c.get("title").asString())).as(c.toString()).isEqualTo(c.get("correction").asBoolean());
		}
		List<VirtualContestQuestions.Filing> filings = new ArrayList<>();
		for (JsonNode f : p.get("filings")) {
			List<List<String>> d = pairs(f.get("details"));
			filings.add(new VirtualContestQuestions.Filing(f.get("receiptNo").asString(), f.get("title").asString(), LocalDate.parse(f.get("date").asString()),
					d == null ? null : d.stream().map(x -> new PlacementDetails.Detail(x.get(0), x.get(1))).toList()));
		}
		// 2026-03-02(전날) ~ 03-12: 날마다 오르는 종가라 보합 없이 모든 원공시가 후보가 된다
		List<LocalDate> dates = new ArrayList<>();
		List<Long> closes = new ArrayList<>();
		for (int i = 0; i < 11; i++) {
			dates.add(LocalDate.of(2026, 3, 2).plusDays(i));
			closes.add(10_000L + i * 100);
		}
		var made = VirtualContestQuestions.fromFilings("회사", "업종", filings, dates, closes);
		assertThat(made).hasSize(p.get("expected").size());
		for (int i = 0; i < made.size(); i++) {
			JsonNode e = p.get("expected").get(i);
			var q = made.get(i);
			assertThat(q.key()).as(e.toString()).isEqualTo(e.get("key").asString());
			assertThat(q.sources()).as(e.toString()).isEqualTo(e.get("sources").valueStream().map(JsonNode::asString).toList());
			assertThat(q.details() == null ? null : q.details().stream().map(d -> List.of(d.label(), d.value())).toList()).as(e.toString()).isEqualTo(pairs(e.get("details")));
		}
		assertThat(made).extracting(VirtualContestQuestions.Past::key).doesNotContainAnyElementsOf(p.get("dropped").valueStream().map(JsonNode::asString).toList());
		JsonNode late = p.get("lateCorrection");
		var merged = VirtualContestQuestions.merge(List.of(new VirtualContestQuestions.Filing("1", "현금ㆍ현물배당결정", LocalDate.parse(late.get("original").asString())),
				new VirtualContestQuestions.Filing("2", "[기재정정]현금ㆍ현물배당결정", LocalDate.parse(late.get("correction").asString()))));
		assertThat(merged).hasSize(1);
		assertThat(!merged.get(0).corrections().isEmpty()).isEqualTo(late.get("merged").asBoolean());
	}

	@Test
	void placement_summary() throws Exception {
		JsonNode p = root().get("placementSummary");
		assertThat(PlacementSummaries.VERSION).isEqualTo(p.get("version").asString());
		assertThat(PlacementSummaries.MAX_CHARS).isEqualTo(p.get("maxChars").asInt());
		assertThat(PlacementSummaries.MIN_SENTENCES).isEqualTo(p.get("minSentences").asInt());
		assertThat(PlacementSummaries.MAX_SENTENCES).isEqualTo(p.get("maxSentences").asInt());
		String source = p.get("source").asString();
		java.util.Set<String> names = new java.util.LinkedHashSet<>(PlacementSummaries.names(source));
		names.add(p.get("company").asString());
		for (JsonNode c : p.get("checks")) {
			PlacementSummaries.Verdict v = PlacementSummaries.check(c.get("text").asString(), source, names);
			assertThat(v.ok() ? "OK" : v.reject().name()).as(c.get("case").asString()).isEqualTo(c.get("expected").asString());
			if (v.ok()) {
				assertThat(v.summary()).isEqualTo(c.get("text").asString().strip().replaceAll("\\s+", " "));
			}
		}
		for (JsonNode c : p.get("names")) {
			assertThat(PlacementSummaries.names(c.get("source").asString())).as(c.toString())
				.containsExactlyElementsOf(c.get("expected").valueStream().map(JsonNode::asString).toList());
		}
	}
}
