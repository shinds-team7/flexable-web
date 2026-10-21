-- applink: 앱에서 받은 시작일과 주기별 반영 기록(04 §5-2). 조회할 때마다 통째로 바꾸고 연동과 함께 지운다.
-- seq: 앱이 준 순서(주기 종료일 오름차순). total_after는 앱이 계산한 반영 후 합계로, 웹에서 다시 계산하지 않는다.
ALTER TABLE app_links ADD COLUMN seed_started_on DATE NULL;

CREATE TABLE app_link_entries (
    app_link_id BIGINT      NOT NULL,
    seq         INT         NOT NULL,
    cycle_end   DATE        NOT NULL,
    choice      VARCHAR(10) NOT NULL,
    amount      BIGINT      NOT NULL,
    total_after BIGINT      NOT NULL,
    created_at  DATETIME(6) NULL,
    PRIMARY KEY (app_link_id, seq),
    CONSTRAINT fk_app_link_entries_link FOREIGN KEY (app_link_id) REFERENCES app_links (id) ON DELETE CASCADE
);
