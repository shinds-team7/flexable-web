package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V35: 저장한 시나리오와 AI 재사용 조합의 기한을 연 × 12 개월로 옮기고, 예전 조합을 지우지 않는다(Issue #377). */
class GoalScenarioMonthsMigrationTest {

	@Test
	void 기한을_개월로_옮기고_재사용_조합을_남긴다() {
		DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:goal-months;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
		Flyway.configure().dataSource(ds).target("34").load().migrate();
		JdbcTemplate jdbc = new JdbcTemplate(ds);
		jdbc.update("INSERT INTO users (id, email, terms_agreed_at, privacy_agreed_at, created_at) VALUES (1, 'a@example.com', NOW(), NOW(), NOW())");
		jdbc.update("INSERT INTO goal_scenarios (id, user_id, saved_at, name, target_amount, years, snapshot) VALUES (5, 1, NOW(), '목돈', 30000000, 2, '{\"months\":24}' FORMAT JSON)");
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, years, as_of, drafts, model, created_at) VALUES (1, 15000000, 1, '2026-11-09', '[\"초안\"]', 'openai', NOW())");
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, years, as_of, drafts, model, created_at) VALUES (1, 15000000, 3, '2026-11-09', '[\"3년 초안\"]', 'openai', NOW())");

		Flyway.configure().dataSource(ds).load().migrate();

		assertThat(jdbc.queryForObject("SELECT months FROM goal_scenarios WHERE id = 5", Integer.class)).isEqualTo(24);
		assertThat(jdbc.queryForList("SELECT months FROM goal_scenario_ai_cache ORDER BY months", Integer.class)).containsExactly(12, 36);
		assertThat(jdbc.queryForObject("SELECT drafts FROM goal_scenario_ai_cache WHERE months = 12", String.class)).isEqualTo("[\"초안\"]");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM information_schema.columns WHERE table_name IN ('goal_scenarios', 'goal_scenario_ai_cache') AND column_name = 'years'",
				Integer.class)).isZero();

		// 기본 키(회원·금액·개월·기준일)가 그대로 걸린다
		assertThatThrownBy(() -> jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, as_of, drafts, model, created_at)"
				+ " VALUES (1, 15000000, 12, '2026-11-09', '[]', 'openai', NOW())")).isInstanceOf(DataIntegrityViolationException.class);
		// 탈퇴하면 함께 지워진다(FK ON DELETE CASCADE)
		jdbc.update("DELETE FROM users WHERE id = 1");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_ai_cache", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenarios", Integer.class)).isZero();
	}
}
