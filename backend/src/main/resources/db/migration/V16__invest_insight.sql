-- 투자 인사이트 개편(decisions/2026-10-26-invest-insight-redesign ⑤·⑦).
-- 업종: 키움 종목정보 리스트(ka10099) upName을 KIWOOM_UPNAME_V1 규칙으로 정리한 값. 모르면 NULL
ALTER TABLE instruments ADD COLUMN industry_name VARCHAR(100) NULL;
ALTER TABLE instruments ADD COLUMN industry_as_of DATE NULL;

-- 시장 띠 일별 값. index_key: KOSPI·KOSDAQ(키움 ka20006) 등, index_value: 지수·환율은 소수 2자리, 금(원/g)은 정수
CREATE TABLE market_index_daily (
    index_key    VARCHAR(16)    NOT NULL,
    trade_date   DATE           NOT NULL,
    index_value  DECIMAL(18, 2) NOT NULL,
    source       VARCHAR(60)    NOT NULL,
    collected_at DATETIME(6)    NOT NULL,
    PRIMARY KEY (index_key, trade_date)
);
