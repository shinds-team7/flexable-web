package com.flexable.web.virtualsim;

import java.math.BigDecimal;
import java.sql.Date;
import java.sql.PreparedStatement;
import java.sql.ResultSet;
import java.sql.SQLException;
import java.sql.Timestamp;
import java.time.Instant;
import java.time.LocalDate;
import java.util.List;
import java.util.Optional;

import org.springframework.dao.DuplicateKeyException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.support.GeneratedKeyHolder;
import org.springframework.jdbc.support.KeyHolder;
import org.springframework.stereotype.Repository;

/**
 * 가상 시뮬레이션 대회 저장소(V27, decisions/2026-11-05-virtual-sim-contest). 회원과 연결한 대회 기록이다. 트랜잭션·잠금은 VirtualContestService가 잡는다.
 * 진행 자료(판의 시드·룰셋·회사·유형·매매, 배치고사 문제)는 정산·채점 때 NULL로 지운다.
 */
@Repository
class VirtualContestStore {

	private final JdbcTemplate jdbc;

	VirtualContestStore(JdbcTemplate jdbc) {
		this.jdbc = jdbc;
	}

	// ───────── 대회 ─────────

	record ContestRow(String id, Instant startsAt, Instant endsAt, String status) {

		boolean open() {
			return "OPEN".equals(status);
		}
	}

	private static ContestRow contest(ResultSet rs, int i) throws SQLException {
		return new ContestRow(rs.getString("id"), instant(rs, "starts_at"), instant(rs, "ends_at"), rs.getString("status"));
	}

	Optional<ContestRow> contest(String id) {
		return jdbc.query("SELECT * FROM virtual_contests WHERE id = ?", VirtualContestStore::contest, id).stream().findFirst();
	}

	/** 없으면 OPEN으로 연다. 이미 있으면 그대로 */
	ContestRow ensureContest(String id, Instant startsAt, Instant endsAt) {
		return contest(id).orElseGet(() -> {
			try {
				jdbc.update("INSERT INTO virtual_contests (id, starts_at, ends_at, status) VALUES (?, ?, ?, 'OPEN')", id, ts(startsAt), ts(endsAt));
			}
			catch (DuplicateKeyException e) {
				// 다른 실행이 먼저 열었다
			}
			return contest(id).orElseThrow();
		});
	}

	List<ContestRow> openContests() {
		return jdbc.query("SELECT * FROM virtual_contests WHERE status = 'OPEN' ORDER BY id", VirtualContestStore::contest);
	}

	boolean markSettled(String id, Instant now) {
		return jdbc.update("UPDATE virtual_contests SET status = 'SETTLED', settled_at = ? WHERE id = ? AND status = 'OPEN'", ts(now), id) == 1;
	}

	/** 끝난 지 12개월이 지난 대회(참가·배치고사·하루·주·판 기록이 함께 지워진다) */
	int deleteEndedBefore(Instant threshold) {
		return jdbc.update("DELETE FROM virtual_contests WHERE ends_at <= ?", ts(threshold));
	}

	// ───────── 별명 ─────────

	Optional<String> alias(long userId) {
		return jdbc.queryForList("SELECT alias FROM virtual_contest_aliases WHERE user_id = ?", String.class, userId).stream().findFirst();
	}

	/** 별명을 붙인다. 같은 별명이 이미 있으면 false(다시 뽑는다) */
	boolean insertAlias(long userId, String alias, Instant now) {
		try {
			jdbc.update("INSERT INTO virtual_contest_aliases (user_id, alias, version, created_at) VALUES (?, ?, ?, ?)", userId, alias,
					VirtualContestAlias.VERSION, ts(now));
			return true;
		}
		catch (DuplicateKeyException e) {
			return false;
		}
	}

	// ───────── 배치고사 ─────────

	record PlacementRow(String id, String contestId, long userId, String questions, String result, Integer correct, String board, Instant startedAt,
			Instant expiresAt, Instant gradedAt) {
	}

	private static PlacementRow placement(ResultSet rs, int i) throws SQLException {
		return new PlacementRow(rs.getString("id"), rs.getString("contest_id"), rs.getLong("user_id"), rs.getString("questions"), rs.getString("result"),
				(Integer) rs.getObject("correct", Integer.class), rs.getString("board"), instant(rs, "started_at"), instant(rs, "expires_at"),
				instant(rs, "graded_at"));
	}

	Optional<PlacementRow> placement(String contestId, long userId) {
		return jdbc.query("SELECT * FROM virtual_contest_placements WHERE contest_id = ? AND user_id = ?", VirtualContestStore::placement, contestId, userId)
			.stream()
			.findFirst();
	}

	Optional<PlacementRow> placementById(String id) {
		return jdbc.query("SELECT * FROM virtual_contest_placements WHERE id = ?", VirtualContestStore::placement, id).stream().findFirst();
	}

	void insertPlacement(String id, String contestId, long userId, String questions, Instant startedAt, Instant expiresAt) {
		jdbc.update("INSERT INTO virtual_contest_placements (id, contest_id, user_id, questions, started_at, expires_at) VALUES (?, ?, ?, ?, ?, ?)", id,
				contestId, userId, questions, ts(startedAt), ts(expiresAt));
	}

	/** 채점 전 배치고사를 지운다(이전 형식 문제) */
	void deletePlacement(String id) {
		jdbc.update("DELETE FROM virtual_contest_placements WHERE id = ? AND graded_at IS NULL", id);
	}

	/** 채점(한 번만). 문제 사본은 지우고 결과만 남긴다 */
	boolean gradePlacement(String id, String result, int correct, VirtualContestBoard board, Instant now) {
		return jdbc.update(
				"UPDATE virtual_contest_placements SET questions = NULL, result = ?, correct = ?, board = ?, graded_at = ? WHERE id = ? AND graded_at IS NULL",
				result, correct, board.name(), ts(now), id) == 1;
	}

	/** 마감 시각이 지났고 아직 채점하지 않은 배치고사 */
	List<PlacementRow> expiredPlacements(String contestId, Instant now) {
		return jdbc.query("SELECT * FROM virtual_contest_placements WHERE contest_id = ? AND graded_at IS NULL AND questions IS NOT NULL AND expires_at <= ?",
				VirtualContestStore::placement, contestId, ts(now));
	}

	/** 대회가 끝날 때 마치지 않은 배치고사의 문제 사본을 지운다(참가가 아니다) */
	void discardUngraded(String contestId) {
		jdbc.update("UPDATE virtual_contest_placements SET questions = NULL WHERE contest_id = ? AND graded_at IS NULL", contestId);
	}

	// ───────── 참가 ─────────

	record EntryRow(long id, String contestId, long userId, int placementCorrect, VirtualContestBoard placementBoard, VirtualContestBoard board,
			VirtualContestBoard highestBoard, long balance, int boardPoints, int rounds, boolean liquidated, Instant reachedAt, Instant joinedAt,
			LocalDate scoredThrough, VirtualContestBoard changeFrom, VirtualContestBoard changeTo, Integer changePoints, Instant changedAt, Integer finalRank,
			Integer finalParticipants, String alias) {
	}

	private static final String ENTRY = "SELECT e.*, a.alias FROM virtual_contest_entries e LEFT JOIN virtual_contest_aliases a ON a.user_id = e.user_id ";

	private static EntryRow entry(ResultSet rs, int i) throws SQLException {
		return new EntryRow(rs.getLong("id"), rs.getString("contest_id"), rs.getLong("user_id"), rs.getInt("placement_correct"),
				board(rs.getString("placement_board")), board(rs.getString("board")), board(rs.getString("highest_board")), rs.getLong("balance"),
				rs.getInt("board_points"), rs.getInt("rounds"), rs.getBoolean("liquidated"), instant(rs, "reached_at"), instant(rs, "joined_at"),
				date(rs, "scored_through"), board(rs.getString("change_from")), board(rs.getString("change_to")),
				rs.getObject("change_points", Integer.class), instant(rs, "changed_at"), rs.getObject("final_rank", Integer.class),
				rs.getObject("final_participants", Integer.class), rs.getString("alias"));
	}

	Optional<EntryRow> entry(String contestId, long userId) {
		return jdbc.query(ENTRY + "WHERE e.contest_id = ? AND e.user_id = ?", VirtualContestStore::entry, contestId, userId).stream().findFirst();
	}

	Optional<EntryRow> entry(long id) {
		return jdbc.query(ENTRY + "WHERE e.id = ?", VirtualContestStore::entry, id).stream().findFirst();
	}

	List<EntryRow> entries(String contestId) {
		return jdbc.query(ENTRY + "WHERE e.contest_id = ? ORDER BY e.id", VirtualContestStore::entry, contestId);
	}

	List<EntryRow> entries(String contestId, VirtualContestBoard board) {
		return jdbc.query(ENTRY + "WHERE e.contest_id = ? AND e.board = ? ORDER BY e.id", VirtualContestStore::entry, contestId, board.name());
	}

	/** 정산한 지난 대회의 내 기록(최신순) */
	List<EntryRow> settledEntries(long userId, int limit) {
		return jdbc.query(ENTRY + "JOIN virtual_contests c ON c.id = e.contest_id WHERE e.user_id = ? AND c.status = 'SETTLED' ORDER BY e.contest_id DESC LIMIT ?",
				VirtualContestStore::entry, userId, limit);
	}

	int countEntries(String contestId, VirtualContestBoard board) {
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_entries WHERE contest_id = ? AND board = ?", Integer.class, contestId,
				board.name());
		return n == null ? 0 : n;
	}

	void insertEntry(String contestId, long userId, int correct, VirtualContestBoard board, Instant now) {
		jdbc.update(
				"INSERT INTO virtual_contest_entries (contest_id, user_id, placement_correct, placement_board, board, highest_board, balance, board_points, rounds, liquidated, reached_at, joined_at) VALUES (?, ?, ?, ?, ?, ?, ?, 0, 0, FALSE, ?, ?)",
				contestId, userId, correct, board.name(), board.name(), board.name(), board.seedMoney(), ts(now), ts(now));
	}

	/** 판 정산 뒤 잔액(판이 그대로일 때만)과 끝낸 판 수 */
	void applyRound(long entryId, VirtualContestBoard board, long balance, Instant now) {
		jdbc.update("UPDATE virtual_contest_entries SET rounds = rounds + 1 WHERE id = ?", entryId);
		jdbc.update("UPDATE virtual_contest_entries SET balance = ?, reached_at = ?, liquidated = ? WHERE id = ? AND board = ?", balance, ts(now),
				VirtualContestRules.liquidated(balance), entryId, board.name());
	}

	/** 하루 점수를 정한 날을 한 칸 옮긴다(조건부, 한 번만) */
	boolean advanceScored(long entryId, LocalDate previous, LocalDate day, int points) {
		return previous == null
				? jdbc.update("UPDATE virtual_contest_entries SET scored_through = ?, board_points = board_points + ? WHERE id = ? AND scored_through IS NULL",
						Date.valueOf(day), points, entryId) == 1
				: jdbc.update("UPDATE virtual_contest_entries SET scored_through = ?, board_points = board_points + ? WHERE id = ? AND scored_through = ?",
						Date.valueOf(day), points, entryId, Date.valueOf(previous)) == 1;
	}

	/** 승급·강등: 판·잔액(새 판 대회 시드머니)·판 점수 0·마지막 판 바뀜 */
	void changeBoard(long entryId, VirtualContestBoard from, VirtualContestBoard to, VirtualContestBoard highest, int weekPoints, Instant now) {
		jdbc.update(
				"UPDATE virtual_contest_entries SET board = ?, balance = ?, board_points = 0, reached_at = ?, highest_board = ?, change_from = ?, change_to = ?, change_points = ?, changed_at = ? WHERE id = ? AND board = ?",
				to.name(), to.seedMoney(), ts(now), highest.name(), from.name(), to.name(), weekPoints, ts(now), entryId, from.name());
	}

	void saveFinal(long entryId, int rank, int participants) {
		jdbc.update("UPDATE virtual_contest_entries SET final_rank = ?, final_participants = ? WHERE id = ?", rank, participants, entryId);
	}

	// ───────── 하루·주 ─────────

	void insertDay(long entryId, LocalDate day, VirtualContestBoard board, Long start, Long end, BigDecimal rate, int points, Instant now) {
		jdbc.update(
				"INSERT INTO virtual_contest_days (entry_id, on_date, board, start_balance, end_balance, return_rate, points, decided_at) VALUES (?, ?, ?, ?, ?, ?, ?, ?)",
				entryId, Date.valueOf(day), board.name(), start, end, rate, points, ts(now));
	}

	/** from~to 날짜 하루 점수 합 */
	int sumPoints(long entryId, LocalDate from, LocalDate to) {
		Integer n = jdbc.queryForObject("SELECT COALESCE(SUM(points), 0) FROM virtual_contest_days WHERE entry_id = ? AND on_date BETWEEN ? AND ?", Integer.class,
				entryId, Date.valueOf(from), Date.valueOf(to));
		return n == null ? 0 : n;
	}

	record DayRow(LocalDate day, VirtualContestBoard board, BigDecimal rate, int points) {
	}

	/** 하루 점수를 정한 날, 최신순 */
	List<DayRow> days(long entryId) {
		return jdbc.query("SELECT on_date, board, return_rate, points FROM virtual_contest_days WHERE entry_id = ? ORDER BY on_date DESC",
				(rs, i) -> new DayRow(date(rs, "on_date"), board(rs.getString("board")), rs.getBigDecimal("return_rate"), rs.getInt("points")), entryId);
	}

	boolean insertWeek(long entryId, int week, int points, VirtualContestBoard from, VirtualContestBoard to, Instant now) {
		try {
			jdbc.update("INSERT INTO virtual_contest_weeks (entry_id, week, points, from_board, to_board, decided_at) VALUES (?, ?, ?, ?, ?, ?)", entryId, week,
					points, from.name(), to.name(), ts(now));
			return true;
		}
		catch (DuplicateKeyException e) {
			return false;
		}
	}

	int countWeeks(long entryId) {
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_weeks WHERE entry_id = ?", Integer.class, entryId);
		return n == null ? 0 : n;
	}

	// ───────── 판 ─────────

	record RoundRow(long id, long entryId, String startId, int roundNumber, VirtualContestBoard board, String generator, LocalDate day, long startBalance,
			Long endBalance, Long holdBalance, Instant startedAt, Instant expiresAt, Instant endedAt, String status, String endReason, Long seed, Long rulesetId,
			Long companyId, String categories, String orders) {

		boolean active() {
			return "ACTIVE".equals(status);
		}
	}

	private static RoundRow round(ResultSet rs, int i) throws SQLException {
		return new RoundRow(rs.getLong("id"), rs.getLong("entry_id"), rs.getString("start_id"), rs.getInt("round_number"), board(rs.getString("board")),
				rs.getString("generator"), date(rs, "on_date"), rs.getLong("start_balance"), rs.getObject("end_balance", Long.class), rs.getObject("hold_balance", Long.class), instant(rs, "started_at"),
				instant(rs, "expires_at"), instant(rs, "ended_at"), rs.getString("status"), rs.getString("end_reason"), rs.getObject("seed", Long.class),
				rs.getObject("ruleset_id", Long.class), rs.getObject("company_id", Long.class), rs.getString("categories"), rs.getString("orders"));
	}

	Optional<RoundRow> round(long id) {
		return jdbc.query("SELECT * FROM virtual_contest_rounds WHERE id = ?", VirtualContestStore::round, id).stream().findFirst();
	}

	Optional<RoundRow> roundByStartId(long entryId, String startId) {
		return jdbc.query("SELECT * FROM virtual_contest_rounds WHERE entry_id = ? AND start_id = ?", VirtualContestStore::round, entryId, startId)
			.stream()
			.findFirst();
	}

	Optional<RoundRow> activeRound(long entryId) {
		return jdbc.query("SELECT * FROM virtual_contest_rounds WHERE entry_id = ? AND status = 'ACTIVE' ORDER BY id", VirtualContestStore::round, entryId)
			.stream()
			.findFirst();
	}

	List<RoundRow> activeRounds() {
		return jdbc.query("SELECT * FROM virtual_contest_rounds WHERE status = 'ACTIVE' ORDER BY id", VirtualContestStore::round);
	}

	List<RoundRow> activeRounds(String contestId) {
		return jdbc.query(
				"SELECT r.* FROM virtual_contest_rounds r JOIN virtual_contest_entries e ON e.id = r.entry_id WHERE e.contest_id = ? AND r.status = 'ACTIVE' ORDER BY r.id",
				VirtualContestStore::round, contestId);
	}

	/** 대회의 정산된 판(평균 초과 수익률 계산용) */
	List<RoundRow> settledRounds(String contestId) {
		return jdbc.query(
				"SELECT r.* FROM virtual_contest_rounds r JOIN virtual_contest_entries e ON e.id = r.entry_id WHERE e.contest_id = ? AND r.status = 'SETTLED' ORDER BY r.id",
				VirtualContestStore::round, contestId);
	}

	/** 참가 하나의 판, 최신순 limit개 */
	List<RoundRow> recentRounds(long entryId, int limit) {
		return jdbc.query("SELECT * FROM virtual_contest_rounds WHERE entry_id = ? ORDER BY id DESC LIMIT ?", VirtualContestStore::round, entryId, limit);
	}

	/** 그날 시작한 판 수 */
	int countRounds(long entryId, LocalDate day) {
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_rounds WHERE entry_id = ? AND on_date = ?", Integer.class, entryId, Date.valueOf(day));
		return n == null ? 0 : n;
	}

	/** 그날(KST) 시작한 판, 시작 순 */
	List<RoundRow> rounds(long entryId, LocalDate day) {
		return jdbc.query("SELECT * FROM virtual_contest_rounds WHERE entry_id = ? AND on_date = ? ORDER BY started_at, id", VirtualContestStore::round, entryId,
				Date.valueOf(day));
	}

	int countRounds(long entryId) {
		Integer n = jdbc.queryForObject("SELECT COUNT(*) FROM virtual_contest_rounds WHERE entry_id = ?", Integer.class, entryId);
		return n == null ? 0 : n;
	}

	long insertRound(long entryId, String startId, int number, VirtualContestBoard board, LocalDate day, long startBalance, Instant startedAt,
			Instant expiresAt, long seed, Long rulesetId, long companyId, String categories) {
		KeyHolder key = new GeneratedKeyHolder();
		jdbc.update(con -> {
			PreparedStatement ps = con.prepareStatement(
					"INSERT INTO virtual_contest_rounds (entry_id, start_id, round_number, board, generator, on_date, start_balance, started_at, expires_at, status, seed, ruleset_id, company_id, categories, orders) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, 'ACTIVE', ?, ?, ?, ?, '[]')",
					new String[] { "id" });
			ps.setLong(1, entryId);
			ps.setString(2, startId);
			ps.setInt(3, number);
			ps.setString(4, board.name());
			ps.setString(5, VirtualSimGenerator.VERSION);
			ps.setDate(6, Date.valueOf(day));
			ps.setLong(7, startBalance);
			ps.setTimestamp(8, ts(startedAt));
			ps.setTimestamp(9, ts(expiresAt));
			ps.setLong(10, seed);
			ps.setObject(11, rulesetId);
			ps.setLong(12, companyId);
			ps.setString(13, categories);
			return ps;
		}, key);
		return key.getKey().longValue();
	}

	void deleteRound(long id) {
		jdbc.update("DELETE FROM virtual_contest_rounds WHERE id = ?", id);
	}

	boolean saveOrders(long id, String orders) {
		return jdbc.update("UPDATE virtual_contest_rounds SET orders = ? WHERE id = ? AND status = 'ACTIVE'", orders, id) == 1;
	}

	/** 정산(한 번만). 진행 자료는 지우고 결과만 남긴다 */
	boolean settleRound(long id, long endBalance, long holdBalance, String reason, Instant now) {
		return jdbc.update(
				"UPDATE virtual_contest_rounds SET status = 'SETTLED', end_balance = ?, hold_balance = ?, end_reason = ?, ended_at = ?, seed = NULL, ruleset_id = NULL, company_id = NULL, categories = NULL, orders = NULL WHERE id = ? AND status = 'ACTIVE'",
				endBalance, holdBalance, reason, ts(now), id) == 1;
	}

	// ───────── 변환 ─────────

	private static Timestamp ts(Instant i) {
		return i == null ? null : Timestamp.from(i);
	}

	private static Instant instant(ResultSet rs, String column) throws SQLException {
		Timestamp t = rs.getTimestamp(column);
		return t == null ? null : t.toInstant();
	}

	private static LocalDate date(ResultSet rs, String column) throws SQLException {
		Date d = rs.getDate(column);
		return d == null ? null : d.toLocalDate();
	}

	private static VirtualContestBoard board(String s) {
		return s == null ? null : VirtualContestBoard.valueOf(s);
	}
}
