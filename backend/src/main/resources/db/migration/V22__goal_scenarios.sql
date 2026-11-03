-- 회원이 저장한 목표 시나리오(F7 v2, policies §7-8). 저장할 때의 계산 결과를 그대로 snapshot에 둔다. 회원당 최대 5개.
CREATE TABLE goal_scenarios (
    id BIGINT NOT NULL AUTO_INCREMENT,
    user_id BIGINT NOT NULL,
    saved_at DATETIME(6) NOT NULL,
    name VARCHAR(20) NOT NULL,
    target_amount BIGINT NOT NULL,
    years INT NOT NULL,
    snapshot JSON NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_goal_scenarios_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

CREATE INDEX idx_goal_scenarios_user ON goal_scenarios (user_id, saved_at);
