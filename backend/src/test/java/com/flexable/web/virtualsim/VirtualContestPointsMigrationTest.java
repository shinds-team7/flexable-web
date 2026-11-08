package com.flexable.web.virtualsim;

import static org.assertj.core.api.Assertions.assertThat;

import java.util.List;
import java.util.Map;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V31: 이미 저장된 대회 점수(하루·주·판·마지막 승급·강등 주 합)를 ×100 하고, 다시 돌려도 결과가 같다(Issue #308) */
class VirtualContestPointsMigrationTest {

	private static final String V31 = "db/migration/V31__virtual_contest_points_x100.sql";

	@Test
	void 기존_점수를_100배로_바꾼다() throws Exception {
		DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:points-x100;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
		Flyway.configure().dataSource(ds).target("30").load().migrate();
		JdbcTemplate jdbc = new JdbcTemplate(ds);
		jdbc.update("INSERT INTO users (id, email, terms_agreed_at, privacy_agreed_at, created_at) VALUES (1, 'a@example.com', NOW(), NOW(), NOW())");
		jdbc.update("INSERT INTO users (id, email, terms_agreed_at, privacy_agreed_at, created_at) VALUES (2, 'b@example.com', NOW(), NOW(), NOW())");
		jdbc.update("INSERT INTO virtual_contests (id, starts_at, ends_at, status) VALUES ('2026-11', NOW(), NOW(), 'OPEN')");
		// 1번: 1주에 +4로 승급한 뒤 새 판에서 +3, 2번: 승급·강등 없이 −2
		jdbc.update("INSERT INTO virtual_contest_entries (id, contest_id, user_id, placement_correct, placement_board, board, highest_board, balance, board_points, reached_at, joined_at, change_from, change_to, change_points, changed_at)"
				+ " VALUES (10, '2026-11', 1, 5, 'B10M', 'B50M', 'B50M', 50000000, 3, NOW(), NOW(), 'B10M', 'B50M', 4, NOW())");
		jdbc.update("INSERT INTO virtual_contest_entries (id, contest_id, user_id, placement_correct, placement_board, board, highest_board, balance, board_points, reached_at, joined_at)"
				+ " VALUES (20, '2026-11', 2, 7, 'B50M', 'B50M', 'B50M', 49000000, -2, NOW(), NOW())");
		int[] days = { 1, 1, 1, 1, 0, 0, 0, 1, 1, 1 };
		for (int i = 0; i < days.length; i++) {
			jdbc.update("INSERT INTO virtual_contest_days (entry_id, on_date, board, points, decided_at) VALUES (10, ?, ?, ?, NOW())", java.sql.Date.valueOf("2026-11-%02d".formatted(i + 1)),
					i < 7 ? "B10M" : "B50M", days[i]);
		}
		jdbc.update("INSERT INTO virtual_contest_days (entry_id, on_date, board, points, decided_at) VALUES (20, '2026-11-01', 'B50M', -1, NOW())");
		jdbc.update("INSERT INTO virtual_contest_days (entry_id, on_date, board, points, decided_at) VALUES (20, '2026-11-02', 'B50M', -1, NOW())");
		jdbc.update("INSERT INTO virtual_contest_weeks (entry_id, week, points, from_board, to_board, decided_at) VALUES (10, 1, 4, 'B10M', 'B50M', NOW())");
		jdbc.update("INSERT INTO virtual_contest_weeks (entry_id, week, points, from_board, to_board, decided_at) VALUES (20, 1, -2, 'B50M', 'B50M', NOW())");
		List<Map<String, Object>> boards = jdbc.queryForList("SELECT id, board, highest_board, balance, change_from, change_to FROM virtual_contest_entries ORDER BY id");

		Flyway.configure().dataSource(ds).load().migrate();
		assertScaled(jdbc, days);
		assertThat(jdbc.queryForList("SELECT id, board, highest_board, balance, change_from, change_to FROM virtual_contest_entries ORDER BY id")).isEqualTo(boards);

		// 같은 SQL을 다시 돌려도 결과가 같다
		String sql = new String(getClass().getClassLoader().getResourceAsStream(V31).readAllBytes(), java.nio.charset.StandardCharsets.UTF_8);
		for (String statement : sql.split(";")) {
			String s = statement.lines().filter(l -> !l.startsWith("--")).reduce("", (x, y) -> x + "\n" + y).trim();
			if (!s.isEmpty()) {
				jdbc.update(s);
			}
		}
		assertScaled(jdbc, days);
	}

	private static void assertScaled(JdbcTemplate jdbc, int[] days) {
		assertThat(jdbc.queryForList("SELECT points FROM virtual_contest_days WHERE entry_id = 10 ORDER BY on_date", Integer.class))
			.containsExactly(java.util.Arrays.stream(days).map(d -> d * VirtualContestRules.DAY_POINTS).boxed().toArray(Integer[]::new));
		assertThat(jdbc.queryForList("SELECT points FROM virtual_contest_days WHERE entry_id = 20 ORDER BY on_date", Integer.class)).containsExactly(-100, -100);
		assertThat(jdbc.queryForList("SELECT points FROM virtual_contest_weeks ORDER BY entry_id", Integer.class)).containsExactly(VirtualContestRules.PROMOTE_AT, -200);
		assertThat(jdbc.queryForList("SELECT board_points FROM virtual_contest_entries ORDER BY id", Integer.class)).containsExactly(300, -200);
		assertThat(jdbc.queryForObject("SELECT change_points FROM virtual_contest_entries WHERE id = 10", Integer.class)).isEqualTo(400);
		assertThat(jdbc.queryForObject("SELECT change_points FROM virtual_contest_entries WHERE id = 20", Integer.class)).isNull();
	}
}
