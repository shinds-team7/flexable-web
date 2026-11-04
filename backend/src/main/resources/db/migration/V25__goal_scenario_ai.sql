-- 목표 시나리오 AI 조합(policies §7-6, #215).
-- 회원·날짜별 AI 사용 횟수. 7일 지나면 정리 작업이 지우고, 탈퇴하면 함께 지운다.
CREATE TABLE goal_scenario_ai_usage (
    usage_date DATE NOT NULL,
    user_id BIGINT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date, user_id),
    CONSTRAINT fk_goal_scenario_ai_usage_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 회원 정보 없는 날짜별 전체 AI 호출 수(비용 상한).
CREATE TABLE goal_scenario_ai_daily (
    usage_date DATE NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date)
);

-- 같은 회원이 같은 목표 금액·기한·자료 기준일로 다시 보면 AI 조합을 다시 부르지 않고 재사용한다. 7일 지나면 지우고, 탈퇴하면 함께 지운다.
CREATE TABLE goal_scenario_ai_cache (
    user_id BIGINT NOT NULL,
    target_amount BIGINT NOT NULL,
    years INT NOT NULL,
    as_of DATE NOT NULL,
    drafts TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, target_amount, years, as_of),
    CONSTRAINT fk_goal_scenario_ai_cache_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
