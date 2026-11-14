-- 목표 시나리오를 시작 금액·월 납입 가능액·기한(목표 금액 선택) 기준 안정·균형·적극 조합으로 바꾼다(Issue #431, policies §7-6).
-- 1) worker가 기한(6~60개월)마다 AI 조합(비중·제목·해설)을 미리 만들어 둔다. 요청 중에는 AI를 부르지 않고 이 행을 읽는다.
--    fingerprint는 AI에게 보낸 자료(기한·유형 통계·상품)의 SHA-256이라 자료가 바뀔 때만 새 행이 생긴다. 회원 정보·금액은 넣지 않는다.
--    last_seen_at은 worker가 지금 자료에 맞는 행을 확인할 때마다 고치고, 14일 동안 확인되지 않은 행은 지운다.
CREATE TABLE goal_scenario_plans (
    prompt_version VARCHAR(40) NOT NULL,
    months INT NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    drafts TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    last_seen_at DATETIME(6) NOT NULL,
    PRIMARY KEY (prompt_version, months, fingerprint)
);
-- 2) 회원이 본 AI 조합(같은 조건 다시 보기는 횟수를 차감하지 않음)의 조건이 바뀐다. 7일 보관 캐시라 옛 행은 옮기지 않고 지운다.
--    목표 금액이 없으면 0으로 둔다(목표 금액은 100만 원 이상이라 겹치지 않는다).
DROP TABLE goal_scenario_ai_cache;
CREATE TABLE goal_scenario_ai_cache (
    user_id BIGINT NOT NULL,
    start_amount BIGINT NOT NULL,
    monthly_budget BIGINT NOT NULL,
    months INT NOT NULL,
    target_amount BIGINT NOT NULL,
    as_of DATE NOT NULL,
    prompt_version VARCHAR(40) NOT NULL,
    drafts TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id, start_amount, monthly_budget, months, target_amount, as_of, prompt_version),
    CONSTRAINT fk_goal_scenario_ai_cache_user_v40 FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
