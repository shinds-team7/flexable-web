-- applink: 웹 회원 ↔ 앱 연동(04 §5·§6). 웹 회원당 하나. 앱 DB와 외래 키는 없다.
-- link_id_cipher: 앱 서버가 준 linkId(비밀값)를 AES-GCM으로 암호화한 값. 평문은 저장하지 않는다.
-- app_*·seed_*: 앱에서 마지막으로 받은 회원 정보·확정 시드머니. 앱 서버 장애 때 "○시 기준"으로 보여 주고, 연동과 함께 지운다.
-- seed_state: available(금액 있음)·budget_not_set(앱 예산 설정 전)·NULL(아직 받지 못함)
-- synced_at: 마지막 성공 조회, checked_at: 마지막 조회 시도, sync_failed: 마지막 조회 실패 여부
CREATE TABLE app_links (
    id                   BIGINT       NOT NULL AUTO_INCREMENT,
    user_id              BIGINT       NOT NULL,
    link_id_cipher       VARCHAR(255) NOT NULL,
    app_email            VARCHAR(254) NULL,
    app_provider         VARCHAR(20)  NOT NULL,
    seed_state           VARCHAR(20)  NULL,
    seed_total           BIGINT       NULL,
    seed_base            BIGINT       NULL,
    seed_monthly_goal    BIGINT       NULL,
    seed_last_cycle_end  DATE         NULL,
    seed_last_choice     VARCHAR(10)  NULL,
    seed_last_amount     BIGINT       NULL,
    seed_last_created_at DATETIME(6)  NULL,
    seed_updated_at      DATETIME(6)  NULL,
    synced_at            DATETIME(6)  NOT NULL,
    checked_at           DATETIME(6)  NOT NULL,
    sync_failed          BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at           DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_app_links_user UNIQUE (user_id),
    CONSTRAINT fk_app_links_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
