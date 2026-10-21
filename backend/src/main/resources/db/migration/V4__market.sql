-- market: 종목(시장별 시가총액 순위)과 일봉. 수집은 worker(ingest)가 하고 api는 읽기만 한다(04 §8, 05 §3).
CREATE TABLE instruments (
    id              BIGINT       NOT NULL AUTO_INCREMENT,
    code            VARCHAR(12)  NOT NULL,
    name            VARCHAR(100) NOT NULL,
    board           VARCHAR(10)  NOT NULL,
    market          VARCHAR(20)  NULL,
    kind            VARCHAR(10)  NOT NULL,
    market_cap      BIGINT       NULL,
    -- 시장 안 시가총액 순위(1부터). 상위 목록에서 빠지면 NULL
    cap_rank        INT          NULL,
    featured_reason VARCHAR(20)  NULL,
    source          VARCHAR(60)  NOT NULL,
    source_note     VARCHAR(200) NULL,
    data_as_of      DATE         NOT NULL,
    updated_at      DATETIME(6)  NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_instruments_code UNIQUE (code)
);
CREATE INDEX idx_instruments_board_rank ON instruments (board, cap_rank);

-- 종목·거래일이 고유 기준. close는 제공처가 준 수정주가 종가(원)
CREATE TABLE daily_prices (
    instrument_id BIGINT      NOT NULL,
    trade_date    DATE        NOT NULL,
    close         BIGINT      NOT NULL,
    volume        BIGINT      NULL,
    source        VARCHAR(60) NOT NULL,
    collected_at  DATETIME(6) NOT NULL,
    PRIMARY KEY (instrument_id, trade_date),
    CONSTRAINT fk_daily_prices_instrument FOREIGN KEY (instrument_id) REFERENCES instruments (id) ON DELETE CASCADE
);

-- ingest: 수집 실행 기록
CREATE TABLE ingest_runs (
    id          BIGINT       NOT NULL AUTO_INCREMENT,
    job         VARCHAR(40)  NOT NULL,
    target_date DATE         NOT NULL,
    status      VARCHAR(12)  NOT NULL,
    started_at  DATETIME(6)  NOT NULL,
    finished_at DATETIME(6)  NULL,
    row_count   INT          NOT NULL DEFAULT 0,
    error       VARCHAR(500) NULL,
    PRIMARY KEY (id)
);
CREATE INDEX idx_ingest_runs_job ON ingest_runs (job, target_date);
