-- 목표 시나리오 유형 해설을 미리 만들어 둔다(Issue #417, policies §7-6).
-- worker가 유형(적금은 상품·만기 경우)마다 AI 해설(넣은 이유·근거·전망)을 한 번 받아 검사하고 저장한다. 요청마다 AI가 다시 쓰지 않는다.
-- fingerprint는 AI에게 보낸 유형 자료(설명·금리·통계·함께 볼 상품·만기 경우)의 SHA-256이라, 자료가 바뀔 때만 새 행이 생긴다.
-- 회원 정보·목표 금액·기한은 넣지 않는다(모든 회원이 같이 쓴다). basis의 "{비중}" 자리는 요청 때 서버가 그 시나리오의 비중으로 바꾼다.
-- last_seen_at은 worker가 지금 자료에 맞는 행을 확인할 때마다 고치고, 14일 동안 확인되지 않은 행은 지운다.
CREATE TABLE goal_scenario_type_roles (
    prompt_version VARCHAR(40) NOT NULL,
    product_type VARCHAR(20) NOT NULL,
    fingerprint CHAR(64) NOT NULL,
    reason TEXT NOT NULL,
    basis TEXT NOT NULL,
    outlook TEXT NOT NULL,
    model VARCHAR(100) NOT NULL,
    created_at DATETIME(6) NOT NULL,
    last_seen_at DATETIME(6) NOT NULL,
    PRIMARY KEY (prompt_version, product_type, fingerprint)
);
