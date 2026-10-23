-- savings: 금융감독원 금융상품한눈에(finlife) 적금 공시를 웹 DB에 복사해 둔다. 화면은 이 테이블만 읽는다.
-- 키: (fin_co_no, fin_prdt_cd). 수집 작업이 같은 키는 갱신하고, 공시에서 사라진 상품은 지운다.
-- sector: BANK(권역 020000) · SAVINGS_BANK(권역 030300)
-- join_deny: 1 제한없음 · 2 서민전용 · 3 일부제한 (공시 그대로)
-- intr_rate_type: S 단리 · M 복리 / rsrv_type: S 정액적립식 · F 자유적립식
-- intr_rate: 기본(저축) 금리, intr_rate2: 최고 우대금리. 연 %, 소수점 2자리. 공시에 없으면 NULL
CREATE TABLE savings_products (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    fin_co_no       VARCHAR(20)  NOT NULL,
    fin_prdt_cd     VARCHAR(60)  NOT NULL,
    sector          VARCHAR(20)  NOT NULL,
    dcls_month      VARCHAR(6)   NOT NULL,
    kor_co_nm       VARCHAR(100) NOT NULL,
    fin_prdt_nm     VARCHAR(200) NOT NULL,
    join_way        VARCHAR(100) NULL,
    mtrt_int        TEXT         NULL,
    spcl_cnd        TEXT         NULL,
    join_deny       VARCHAR(1)   NULL,
    join_member     TEXT         NULL,
    etc_note        TEXT         NULL,
    max_limit       BIGINT       NULL,
    dcls_strt_day   VARCHAR(8)   NULL,
    dcls_end_day    VARCHAR(8)   NULL,
    fin_co_subm_day VARCHAR(12)  NULL,
    fetched_at      DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_savings_products_key UNIQUE (fin_co_no, fin_prdt_cd)
);

CREATE TABLE savings_rate_options (
    id             BIGINT        NOT NULL AUTO_INCREMENT,
    product_id     BIGINT        NOT NULL,
    intr_rate_type VARCHAR(1)    NOT NULL,
    rsrv_type      VARCHAR(1)    NOT NULL,
    save_trm       INT           NOT NULL,
    intr_rate      DECIMAL(5, 2) NULL,
    intr_rate2     DECIMAL(5, 2) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_savings_rate_options UNIQUE (product_id, intr_rate_type, rsrv_type, save_trm),
    CONSTRAINT fk_savings_rate_options_product FOREIGN KEY (product_id) REFERENCES savings_products (id) ON DELETE CASCADE
);

CREATE INDEX idx_savings_rate_options_lookup ON savings_rate_options (rsrv_type, save_trm);
