-- 오류 기록(브라우저가 보낸 오류 + 서버 500). 같은 날 같은 오류(fingerprint)는 한 줄로 묶고 occurrences만 올린다.
-- 30일 지나면 서버가 매일 지운다(ErrorEventCleanupJob). 회원 탈퇴 때 그 회원 줄도 지운다(ErrorEventService.onWithdraw).
-- 숫자(3자리 이상)·이메일처럼 보이는 글자는 저장 전에 가린다. 요청·응답 본문은 받지 않는다.
CREATE TABLE error_events (
    id           BIGINT        NOT NULL AUTO_INCREMENT,
    event_day    DATE          NOT NULL,
    fingerprint  VARCHAR(64)   NOT NULL,
    source       VARCHAR(10)   NOT NULL,
    kind         VARCHAR(10)   NOT NULL,
    user_id      BIGINT        NULL,
    app_version  VARCHAR(20)   NULL,
    platform     VARCHAR(10)   NULL,
    screen       VARCHAR(100)  NULL,
    method       VARCHAR(10)   NULL,
    path         VARCHAR(200)  NULL,
    status       INT           NULL,
    code         VARCHAR(40)   NULL,
    message      VARCHAR(500)  NOT NULL,
    stack        VARCHAR(4000) NULL,
    occurrences  INT           NOT NULL,
    first_at     DATETIME(6)   NOT NULL,
    last_at      DATETIME(6)   NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_error_events_day_fp UNIQUE (event_day, fingerprint)
);
CREATE INDEX ix_error_events_user ON error_events (user_id);
