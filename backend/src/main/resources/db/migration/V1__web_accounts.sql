-- 웹 계정(04 §4·§6). 앱(project2) DB와 외래 키는 없다.

-- member: 웹 회원 정보와 동의 시각
CREATE TABLE members (
    id                BIGINT       NOT NULL AUTO_INCREMENT,
    email             VARCHAR(254) NOT NULL,
    terms_agreed_at   DATETIME(6)  NOT NULL,
    privacy_agreed_at DATETIME(6)  NOT NULL,
    created_at        DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_members_email UNIQUE (email)
);

-- member: 웹 설정(테마·본 안내·고지 확인 시각)
CREATE TABLE member_settings (
    member_id         BIGINT        NOT NULL,
    theme             VARCHAR(10)   NOT NULL,
    seen_tours        VARCHAR(1000) NOT NULL,
    disclaimer_ack_at DATETIME(6)   NULL,
    updated_at        DATETIME(6)   NOT NULL,
    PRIMARY KEY (member_id),
    CONSTRAINT fk_member_settings_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
);

-- auth: 로그인 수단과 토큰 폐기 버전
CREATE TABLE member_credentials (
    member_id     BIGINT       NOT NULL,
    password_hash VARCHAR(100) NOT NULL,
    token_version INT          NOT NULL DEFAULT 0,
    updated_at    DATETIME(6)  NOT NULL,
    PRIMARY KEY (member_id),
    CONSTRAINT fk_member_credentials_member FOREIGN KEY (member_id) REFERENCES members (id) ON DELETE CASCADE
);
