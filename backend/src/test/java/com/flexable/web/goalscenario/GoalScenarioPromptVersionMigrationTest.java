package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V38: AI 재사용 조합에 프롬프트 버전 칸을 더하고, 기존 조합은 버전을 몰라 null로 남긴다(Issue #406). */
class GoalScenarioPromptVersionMigrationTest {

	@Test
	void 기존_재사용_조합은_버전이_null로_남는다() {
		DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:goal-prompt-version;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
		Flyway.configure().dataSource(ds).target("37").load().migrate();
		JdbcTemplate jdbc = new JdbcTemplate(ds);
		jdbc.update("INSERT INTO users (id, email, terms_agreed_at, privacy_agreed_at, created_at) VALUES (1, 'a@example.com', NOW(), NOW(), NOW())");
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, monthly_budget, as_of, drafts, model, created_at)"
				+ " VALUES (1, 15000000, 12, 0, '2026-11-10', '[\"초안\"]', 'openai', NOW())");

		Flyway.configure().dataSource(ds).load().migrate();

		assertThat(jdbc.queryForObject("SELECT prompt_version FROM goal_scenario_ai_cache WHERE months = 12", String.class)).isNull();
		assertThat(jdbc.queryForObject("SELECT drafts FROM goal_scenario_ai_cache WHERE months = 12", String.class)).isEqualTo("[\"초안\"]");
		jdbc.update("UPDATE goal_scenario_ai_cache SET prompt_version = 'goal-scenario-v11' WHERE months = 12");
		assertThat(jdbc.queryForObject("SELECT prompt_version FROM goal_scenario_ai_cache WHERE months = 12", String.class)).isEqualTo("goal-scenario-v11");
	}
}
