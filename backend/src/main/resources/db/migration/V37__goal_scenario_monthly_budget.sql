-- 목표 시나리오에 월 납입 가능액(선택)을 더한다(Issue #399, policies §7-1·7-6).
-- AI 조합 재사용(§7-6)의 조건에 가능액을 더한다. 기본 키 칸이라 가능액이 없으면 0으로 두고, 기존 행(가능액 없이 받은 조합)도 0이다.
-- V35와 같이 기본 키를 직접 바꾸지 않고 새 테이블로 옮겨 MySQL·H2에서 같게 동작한다. FK 이름은 DB 안에서 겹치면 안 돼 새 이름을 쓴다.
-- 저장한 시나리오(goal_scenarios)는 가능액을 스냅샷 JSON에 담아 칸을 더하지 않는다.
CREATE TABLE goal_scenario_ai_cache_v37 (
    user_id BIGINT NOT NULL,
    target_amount BIGINT NOT NULL,
    months INT NOT NULL,
    monthly_budget BIGINT NOT NULL,
    as_of DATE NOT NULL,
    drafts TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, target_amount, months, monthly_budget, as_of),
    CONSTRAINT fk_goal_scenario_ai_cache_user_v37 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
INSERT INTO goal_scenario_ai_cache_v37 (user_id, target_amount, months, monthly_budget, as_of, drafts, model, created_at)
    SELECT user_id, target_amount, months, 0, as_of, drafts, model, created_at FROM goal_scenario_ai_cache;
DROP TABLE goal_scenario_ai_cache;
ALTER TABLE goal_scenario_ai_cache_v37 RENAME TO goal_scenario_ai_cache;
