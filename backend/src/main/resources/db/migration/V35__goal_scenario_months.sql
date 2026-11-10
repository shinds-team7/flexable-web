-- 목표 시나리오 기한을 연(1·2·3)에서 개월(6~36)로 바꾼다(Issue #377, policies §7-1).
-- 저장한 시나리오는 기존 연 × 12를 개월로 옮긴다. 스냅샷 JSON에는 이미 months가 있어 바꾸지 않는다.
ALTER TABLE goal_scenarios ADD COLUMN months INT NOT NULL DEFAULT 0;
UPDATE goal_scenarios SET months = years * 12;
ALTER TABLE goal_scenarios ALTER COLUMN months DROP DEFAULT;
ALTER TABLE goal_scenarios DROP COLUMN years;

-- AI 조합 재사용은 7일만 두는 캐시라 기존 행을 지우고 키를 개월로 바꾼다(같은 조건으로 다시 보면 한 번 새로 만든다).
DROP TABLE goal_scenario_ai_cache;
CREATE TABLE goal_scenario_ai_cache (
    user_id BIGINT NOT NULL,
    target_amount BIGINT NOT NULL,
    months INT NOT NULL,
    as_of DATE NOT NULL,
    drafts TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, target_amount, months, as_of),
    CONSTRAINT fk_goal_scenario_ai_cache_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
