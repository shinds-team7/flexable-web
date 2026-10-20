-- 웹 계정(04 §4·§6). 앱(project2) DB와 외래 키는 없다.

-- user: 웹 회원 정보와 동의 시각
CREATE TABLE users (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    email             VARCHAR(254) NOT NULL,
    terms_agreed_at   DATETIME(6)  NOT NULL,
    privacy_agreed_at DATETIME(6)  NOT NULL,
    created_at        DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_users_email UNIQUE (email)
);

-- user: 웹 설정(테마·본 안내·고지 확인 시각)
CREATE TABLE user_settings (
    user_id         BIGINT        NOT NULL,
    theme             VARCHAR(10)   NOT NULL,
    seen_tours        VARCHAR(1000) NOT NULL,
    disclaimer_ack_at DATETIME(6)   NULL,
    updated_at        DATETIME(6)   NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_settings_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);

-- auth: 로그인 수단과 토큰 폐기 버전
CREATE TABLE user_credentials (
    user_id     BIGINT       NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    token_version INT          NOT NULL DEFAULT 0,
    updated_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (user_id),
    CONSTRAINT fk_user_credentials_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE
);
