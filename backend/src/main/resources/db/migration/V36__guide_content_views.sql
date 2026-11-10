-- 금융 가이드 글별 조회수. 합계 표는 계속 남고, 방문자 기록은 같은 날 중복을 막는 용도로 30일만 둔다(guide.GuideContentViewCleanupJob).
-- viewer_id는 브라우저가 만든 임의 값(UUID)이라 계정과 이어지지 않는다. 글을 추가하면 새 마이그레이션으로 합계 표에 줄을 넣는다.
CREATE TABLE guide_content_views (
    content_id VARCHAR(64) NOT NULL,
    view_count BIGINT      NOT NULL DEFAULT 0,
    PRIMARY KEY (content_id)
);

INSERT INTO guide_content_views (content_id, view_count) VALUES
    ('interest-rate', 0),
    ('interest-income-tax', 0),
    ('simple-vs-compound', 0),
    ('inflation-real-rate', 0),
    ('exchange-rate', 0),
    ('gross-vs-net-pay', 0),
    ('year-end-tax', 0),
    ('credit-score', 0),
    ('loan-rate-repayment', 0),
    ('saving-vs-investing', 0),
    ('deposit-vs-savings', 0),
    ('parking-vs-cma', 0),
    ('housing-subscription', 0),
    ('stock-basics', 0),
    ('kospi-vs-kosdaq', 0),
    ('bond-basics', 0),
    ('fund-vs-etf', 0),
    ('isa-vs-pension', 0);

CREATE TABLE guide_content_view_log (
    id         BIGINT      NOT NULL AUTO_INCREMENT,
    content_id VARCHAR(64) NOT NULL,
    viewer_id  VARCHAR(36) NOT NULL,
    viewed_on  DATE        NOT NULL,
    PRIMARY KEY (id),
    CONSTRAINT uk_guide_content_view_log UNIQUE (content_id, viewer_id, viewed_on)
);
CREATE INDEX idx_guide_content_view_log_day ON guide_content_view_log (viewed_on);
