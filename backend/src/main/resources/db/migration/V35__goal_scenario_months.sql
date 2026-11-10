-- 목표 시나리오 기한을 연(1·2·3)에서 개월(6~36)로 바꾼다(Issue #377, policies §7-1).
-- 저장한 시나리오는 기존 연 × 12를 개월로 옮긴다. 스냅샷 JSON에는 이미 months가 있어 바꾸지 않는다.
ALTER TABLE goal_scenarios ADD COLUMN months INT NOT NULL DEFAULT 0;
UPDATE goal_scenarios SET months = years * 12;
ALTER TABLE goal_scenarios ALTER COLUMN months DROP DEFAULT;
ALTER TABLE goal_scenarios DROP COLUMN years;

-- AI 조합 재사용(§7-6)은 키가 (회원, 목표 금액, 기한, 기준일)이라 기한 칸을 개월로 바꾼 새 테이블을 만들고
-- 기존 행을 연 × 12로 옮긴다(배포 전에 받은 조합도 12·24·36개월 조건으로 그대로 재사용한다).
-- 기본 키를 직접 바꾸지 않아 MySQL·H2에서 같게 동작한다. FK 이름은 DB 안에서 겹치면 안 돼 새 이름을 쓴다.
CREATE TABLE goal_scenario_ai_cache_v35 (
    user_id BIGINT NOT NULL,
    target_amount BIGINT NOT NULL,
    months INT NOT NULL,
    as_of DATE NOT NULL,
    drafts TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, target_amount, months, as_of),
    CONSTRAINT fk_goal_scenario_ai_cache_user_v35 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
INSERT INTO goal_scenario_ai_cache_v35 (user_id, target_amount, months, as_of, drafts, model, created_at)
    SELECT user_id, target_amount, years * 12, as_of, drafts, model, created_at FROM goal_scenario_ai_cache;
DROP TABLE goal_scenario_ai_cache;
ALTER TABLE goal_scenario_ai_cache_v35 RENAME TO goal_scenario_ai_cache;
