-- 웹에서 직접 고친 시드머니(seedmoney). 회원당 하나, 있으면 앱 연동 값보다 우선한다. 되돌리기·탈퇴 때 지운다.
CREATE TABLE seed_money_manual (
    user_id    BIGINT      NOT NULL,
    total      BIGINT      NOT NULL,
    updated_at DATETIME(6) NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_seed_money_manual_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
