-- 웹 소셜 로그인(카카오·Google). 공급자가 이메일을 주지 않거나 확인되지 않은 이메일이면 email은 비워 둔다.
ALTER TABLE users MODIFY COLUMN email VARCHAR(254) NULL;
-- 소셜로만 가입한 회원도 토큰 버전을 가지므로 행은 만들고 비밀번호만 비워 둔다.
ALTER TABLE user_credentials MODIFY COLUMN password_hash VARCHAR(100) NULL;

-- auth: 소셜 로그인 수단
CREATE TABLE user_identities (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    user_id          BIGINT       NOT NULL,
    provider         VARCHAR(20)  NOT NULL,
    provider_user_id VARCHAR(100) NOT NULL,
    email            VARCHAR(254) NULL,
    created_at       DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT fk_user_identities_user FOREIGN KEY (user_id) REFERENCES users (id) ON DELETE CASCADE,
    CONSTRAINT uk_user_identities_provider UNIQUE (provider, provider_user_id)
);
CREATE INDEX idx_user_identities_user ON user_identities (user_id);
