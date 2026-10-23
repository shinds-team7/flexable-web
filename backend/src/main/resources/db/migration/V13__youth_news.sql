-- news: 청년 금융 소식(01 §F4, 03 §5-7). 수집은 worker(ingest)가 하고, 화면(api)은 승인된 소식만 읽는다.

-- 수집 원문. source: YOUTH_CENTER(온통청년) | FAKE. payload는 받은 그대로(JSON), content_hash로 바뀌었는지 본다
CREATE TABLE youth_news_raw (
    id           BIGINT      NOT NULL AUTO_INCREMENT,
    source       VARCHAR(20) NOT NULL,
    external_id  VARCHAR(60) NOT NULL,
    payload      TEXT        NOT NULL,
    content_hash VARCHAR(64) NOT NULL,
    fetched_at   DATETIME(6) NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_youth_news_raw UNIQUE (source, external_id)
);

-- 소식 카드. 필드는 01 §F4 카드 필수 항목(= API 필드). 원문에서 못 찾은 값은 NULL(조건 없음이 아니다)
-- review_status: DRAFT(수집 초안) | APPROVED(화면에 나감) | REJECTED. 승인·반려된 소식은 다시 수집해도 덮어쓰지 않는다
-- regions: NATIONWIDE 또는 쉼표로 이은 시도 이름(서울,경기)
-- categories: 쉼표로 이은 분야(첫 번째가 대표). TRANSPORT | HOUSING | FINANCE | JOB | EDUCATION | CULTURE | TAX | ETC(기타)
-- calc_target: 승인된 내부 계산 화면 키만(03 §8). slot: MAIN(오늘의 한 장) | SUB
CREATE TABLE youth_news (
    id               BIGINT       NOT NULL AUTO_INCREMENT,
    raw_id           BIGINT       NULL,
    source           VARCHAR(20)  NOT NULL,
    external_id      VARCHAR(60)  NOT NULL,
    review_status    VARCHAR(10)  NOT NULL,
    categories       VARCHAR(80)  NOT NULL,
    title            VARCHAR(200) NOT NULL,
    benefit          VARCHAR(200) NULL,
    audience_summary VARCHAR(200) NULL,
    age_min          INT          NULL,
    age_max          INT          NULL,
    income_limit     BOOLEAN      NULL,
    regions          VARCHAR(200) NULL,
    apply_start      DATE         NULL,
    apply_deadline   DATE         NULL,
    always_open      BOOLEAN      NOT NULL,
    -- 원문의 사업기간 끝(bizPrdEndYmd). 신청 날짜가 없는 소식이 끝났는지 볼 때만 쓴다
    biz_end          DATE         NULL,
    action           VARCHAR(200) NULL,
    source_org       VARCHAR(100) NULL,
    source_url       VARCHAR(500) NULL,
    as_of            DATE         NOT NULL,
    posted_at        DATE         NULL,
    keywords         VARCHAR(300) NULL,
    calc_target      VARCHAR(30)  NULL,
    slot             VARCHAR(4)   NULL,
    corrected_at     DATE         NULL,
    created_at       DATETIME(6)  NOT NULL,
    updated_at       DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_youth_news UNIQUE (source, external_id),
    CONSTRAINT fk_youth_news_raw FOREIGN KEY (raw_id) REFERENCES youth_news_raw (id) ON DELETE SET NULL
);
CREATE INDEX idx_youth_news_status_deadline ON youth_news (review_status, apply_deadline);
