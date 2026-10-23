-- 목표는 회원당 하나. id는 삭제 후 다시 만든 목표와 이전 AI 요청을 구별한다.
CREATE TABLE goals (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    version INT NOT NULL,
    category VARCHAR(20) NOT NULL,
    name VARCHAR(20) NOT NULL,
    amount BIGINT NOT NULL,
    due_month CHAR(7) NOT NULL,
    current_amount BIGINT NULL,
    monthly_pace BIGINT NULL,
    created_at DATETIME(6) NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_goals_user UNIQUE (user_id),
    CONSTRAINT fk_goals_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE TABLE goal_coaches (
    user_id BIGINT NOT NULL,
    goal_id BIGINT NOT NULL,
    goal_version INT NOT NULL,
    facts_hash CHAR(64) NOT NULL,
    ai_generated BOOLEAN NOT NULL,
    model VARCHAR(100) NULL,
    fallback_reason VARCHAR(30) NULL,
    content JSON NOT NULL,
    requested_at DATETIME(6) NOT NULL,
    generated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_goal_coaches_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT fk_goal_coaches_goal FOREIGN KEY (goal_id) REFERENCES goals (id) ON DELETE CASCADE
);

CREATE TABLE goal_coach_usage (
    usage_date DATE NOT NULL,
    user_id BIGINT NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date, user_id),
    CONSTRAINT fk_goal_coach_usage_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- 회원 정보가 없는 전체 횟수. 탈퇴·목표 삭제로 줄어들지 않는다.
CREATE TABLE ai_daily_usage (
    usage_date DATE NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date)
);
