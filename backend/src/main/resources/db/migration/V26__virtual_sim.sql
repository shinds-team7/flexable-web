-- 가상 시뮬레이션(decisions/2026-11-04-virtual-simulation, policies §8). 수집·생성은 worker(ingest)가 하고 api는 읽기만 한다.
-- 모두 공개 시장 자료와 AI가 쓴 가상 회사·사건 글이다. 사용자 세션·투자금·선택은 저장하지 않는다(서버 메모리 30분).

-- 수집 대상 종목의 DART 공시 목록 전체(OpenDART list.json). 룰셋의 사건 유형별 경로 표본(1-2·1-8)
CREATE TABLE dart_disclosures (
    receipt_no   VARCHAR(14)  NOT NULL,
    stock_code   VARCHAR(12)  NOT NULL,
    corp_code    VARCHAR(8)   NOT NULL,
    title        VARCHAR(300) NOT NULL,
    receipt_date DATE         NOT NULL,
    collected_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (receipt_no)
);
CREATE INDEX idx_dart_disclosures_stock ON dart_disclosures (stock_code, receipt_date);

-- 종목별 공시 목록 수집 진행. covered_to가 있으면 covered_from~covered_to를 다 받은 종목(룰셋에 쓴다).
-- pending_*·next_page: 실행당 호출 상한에 걸려 멈춘 구간과 다음에 받을 쪽(1부터)
CREATE TABLE dart_disclosure_archive (
    stock_code   VARCHAR(12) NOT NULL,
    corp_code    VARCHAR(8)  NOT NULL,
    covered_from DATE        NULL,
    covered_to   DATE        NULL,
    pending_from DATE        NULL,
    pending_to   DATE        NULL,
    next_page    INT         NULL,
    updated_at   DATETIME(6) NOT NULL,
    PRIMARY KEY (stock_code)
);

-- 룰셋(vsim-rules-v2). payload는 유형별 경로·요약과 변동성 등급별 분위표 JSON. 세션은 최신 행을 복사해 쓴다
CREATE TABLE virtual_sim_rulesets (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    version    VARCHAR(20) NOT NULL,
    data_from  DATE        NULL,
    data_to    DATE        NULL,
    payload    LONGTEXT    NOT NULL,
    is_sample  BOOLEAN     NOT NULL DEFAULT FALSE,
    created_at DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
);

-- 가상 회사. 이름·소개는 AI(예시면 예시 작성기)가 쓰고 자동 검사(check_version)를 통과한 것만 저장한다. hidden은 운영자 숨김
CREATE TABLE virtual_sim_companies (
    id             BIGINT      NOT NULL AUTO_INCREMENT,
    name           VARCHAR(20) NOT NULL,
    industry       VARCHAR(40) NOT NULL,
    intro          VARCHAR(120) NOT NULL,
    model          VARCHAR(80) NOT NULL,
    prompt_version VARCHAR(30) NOT NULL,
    check_version  VARCHAR(30) NOT NULL,
    is_sample      BOOLEAN     NOT NULL DEFAULT FALSE,
    hidden         BOOLEAN     NOT NULL DEFAULT FALSE,
    generated_at   DATETIME(6) NOT NULL,
    PRIMARY KEY (id)
);

-- 가상 사건 본문(유형마다 하나). 제목은 저장하지 않고 서버가 유형별 실제 공시 제목 형식으로 붙인다
CREATE TABLE virtual_sim_events (
    id         BIGINT       NOT NULL AUTO_INCREMENT,
    company_id BIGINT       NOT NULL,
    category   VARCHAR(20)  NOT NULL,
    body       VARCHAR(240) NOT NULL,
    hidden     BOOLEAN      NOT NULL DEFAULT FALSE,
    PRIMARY KEY (id),
    CONSTRAINT uk_virtual_sim_events UNIQUE (company_id, category),
    CONSTRAINT fk_virtual_sim_events_company FOREIGN KEY (company_id) REFERENCES virtual_sim_companies (id) ON DELETE CASCADE
);
