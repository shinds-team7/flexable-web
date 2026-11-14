package com.flexable.web.goalscenario;

import static org.assertj.core.api.Assertions.assertThat;
import static org.assertj.core.api.Assertions.assertThatThrownBy;

import org.flywaydb.core.Flyway;
import org.junit.jupiter.api.Test;
import org.springframework.dao.DataIntegrityViolationException;
import org.springframework.jdbc.core.JdbcTemplate;
import org.springframework.jdbc.datasource.DriverManagerDataSource;

/** V40: 기한별 미리 만든 조합 표를 더하고, 회원이 본 조합 표는 새 조건(시작 금액·월 금액·기한·목표)으로 다시 만든다(Issue #431). */
class GoalScenarioPlansMigrationTest {

	@Test
	void 옛_재사용_조합은_지우고_새_조건으로_둔다() {
		DriverManagerDataSource ds = new DriverManagerDataSource("jdbc:h2:mem:goal-plans;MODE=MySQL;DATABASE_TO_LOWER=TRUE;DB_CLOSE_DELAY=-1", "sa", "");
		Flyway.configure().dataSource(ds).target("39").load().migrate();
		JdbcTemplate jdbc = new JdbcTemplate(ds);
		jdbc.update("INSERT INTO users (id, email, terms_agreed_at, privacy_agreed_at, created_at) VALUES (1, 'a@example.com', NOW(), NOW(), NOW())");
		jdbc.update("INSERT INTO goal_scenario_ai_cache (user_id, target_amount, months, monthly_budget, as_of, drafts, model, prompt_version, created_at)"
				+ " VALUES (1, 15000000, 12, 0, '2026-11-10', '[]', 'openai', 'goal-scenario-v13', NOW())");

		Flyway.configure().dataSource(ds).target("40").load().migrate();

		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_ai_cache", Integer.class)).isZero();
		String insert = "INSERT INTO goal_scenario_ai_cache (user_id, start_amount, monthly_budget, months, target_amount, as_of, prompt_version, drafts, model,"
				+ " created_at) VALUES (1, ?, 500000, 12, 0, '2026-11-14', 'goal-scenario-v14', '[]', 'openai', NOW())";
		jdbc.update(insert, 0L);
		// 시작 금액이 다르면 다른 조건이다
		jdbc.update(insert, 1_000_000L);
		assertThatThrownBy(() -> jdbc.update(insert, 0L)).isInstanceOf(DataIntegrityViolationException.class);
		jdbc.update("INSERT INTO goal_scenario_plans (prompt_version, months, fingerprint, drafts, model, created_at, last_seen_at)"
				+ " VALUES ('goal-scenario-v14', 12, ?, '[]', 'openai', NOW(), NOW())", "a".repeat(64));
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_plans", Integer.class)).isOne();
		// 탈퇴하면 본 조합도 지워진다(FK ON DELETE CASCADE). 미리 만든 조합은 회원 정보가 없어 그대로다
		jdbc.update("DELETE FROM users WHERE id = 1");
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_ai_cache", Integer.class)).isZero();
		assertThat(jdbc.queryForObject("SELECT COUNT(*) FROM goal_scenario_plans", Integer.class)).isOne();
	}
}
