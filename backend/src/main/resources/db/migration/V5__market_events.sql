-- market: 급변동 사건(03 §5-3, C-8)과 근거(§5-4). 탐지·근거 수집은 worker(ingest)가 하고 api는 읽기만 한다.

-- OpenDART 고유번호(8자리). 종목코드로 corpCode.xml에서 찾아 넣는다. ETF·못 찾은 종목은 NULL
ALTER TABLE instruments ADD COLUMN corp_code VARCHAR(8) NULL;

-- scope: STOCK(종목 사건) | MARKET(시장 전체, instrument_id는 시장 대용 종목). direction: RISE | FALL
-- return_rate·market_return은 사건 시작 전날 종가 대비 마지막 날 종가 수익률(0.05 = 5%)
CREATE TABLE market_events (
    id                  BIGINT      NOT NULL AUTO_INCREMENT,
    instrument_id       BIGINT      NOT NULL,
    scope               VARCHAR(10) NOT NULL,
    start_date          DATE        NOT NULL,
    end_date            DATE        NOT NULL,
    window_days         INT         NOT NULL,
    direction           VARCHAR(4)  NOT NULL,
    return_rate         DOUBLE      NOT NULL,
    market_return       DOUBLE      NULL,
    z_score             DOUBLE      NOT NULL,
    volume_ratio        DOUBLE      NULL,
    score               DOUBLE      NOT NULL,
    rank_in_year        INT         NOT NULL,
    detector_version    VARCHAR(20) NOT NULL,
    detected_at         DATETIME(6) NOT NULL,
    -- 근거(공시)를 마지막으로 찾아본 시각. NULL이면 아직 안 찾았다
    evidence_checked_at DATETIME(6) NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_market_events UNIQUE (instrument_id, scope, start_date, detector_version),
    CONSTRAINT fk_market_events_instrument FOREIGN KEY (instrument_id) REFERENCES instruments (id) ON DELETE CASCADE
);
CREATE INDEX idx_market_events_instrument_start ON market_events (instrument_id, start_date);

-- 사건 근거. type: DART(공시). external_id는 제공처 번호(DART 접수번호)
CREATE TABLE event_sources (
    id             BIGINT       NOT NULL AUTO_INCREMENT,
    event_id       BIGINT       NOT NULL,
    type           VARCHAR(10)  NOT NULL,
    external_id    VARCHAR(40)  NOT NULL,
    title          VARCHAR(300) NOT NULL,
    publisher      VARCHAR(100) NULL,
    published_date DATE         NOT NULL,
    url            VARCHAR(300) NOT NULL,
    weight         INT          NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_event_sources UNIQUE (event_id, type, external_id),
    CONSTRAINT fk_event_sources_event FOREIGN KEY (event_id) REFERENCES market_events (id) ON DELETE CASCADE
);
