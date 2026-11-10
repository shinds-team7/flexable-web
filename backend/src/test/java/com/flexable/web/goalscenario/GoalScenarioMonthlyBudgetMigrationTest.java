package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V37: AI 재사용 조합의 조건에 월 납입 가능액을 더하고, 기존 조합은 가능액 없음(0)으로 남긴다(Issue #399). */
class GoalScenarioMonthlyBudgetMigrationTest {

	@Test
	void 기존_재사용_조합은_가능액_없음으로_남고_가능액이_다르면_따로_둔다() {
		DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:goal-budget;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
		Flyway.configure().dataSource(ds).target("36").load().migrate();
		JdbcTemplate jdbc = new JdbcTemplate(ds);
		jdbc.update("INSERT INTO users (id, email, terms_agreed_at, privacy_agreed_at, created_at) VALUES (1, 'a@example.com', NOW(), NOW(), NOW())");
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, as_of, drafts, model, created_at) VALUES (1, 15000000, 12, '2026-11-10', '[\"초안\"]', 'openai', NOW())");

		Flyway.configure().dataSource(ds).load().migrate();

		assertThat(jdbc.queryForObject("SELECT monthly_budget FROM goal_scenario_ai_cache WHERE months = 12", Long.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT drafts FROM goal_scenario_ai_cache WHERE months = 12", String.class)).isEqualTo("[\"초안\"]");
		// 같은 금액·기한·기준일이어도 가능액이 다르면 따로 둔다
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, monthly_budget, as_of, drafts, model, created_at)"
				+ " VALUES (1, 15000000, 12, 500000, '2026-11-10', '[]', 'openai', NOW())");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_ai_cache", Integer.class)).isEqualTo(2);
		// 기본 키(회원·금액·개월·가능액·기준일)가 걸린다
		assertThatThrownBy(() -> jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, monthly_budget, as_of, drafts, model, created_at)"
				+ " VALUES (1, 15000000, 12, 0, '2026-11-10', '[]', 'openai', NOW())")).isInstanceOf(DataIntegrityViolationException.class);
		// 탈퇴하면 함께 지워진다(FK ON DELETE CASCADE)
		jdbc.update("DELETE FROM users WHERE id = 1");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_ai_cache", Integer.class)).isZero();
	}
}
