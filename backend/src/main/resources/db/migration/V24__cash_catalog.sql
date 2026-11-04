-- main과 열린 PR의 실제 마이그레이션을 확인한 다음 번호(V24).
-- 수기 입력·운영 시드 없음. 허용 출처의 검증된 전체 스냅샷만 내부 수집 경계로 반영한다.
CREATE TABLE cash_catalog_snapshots (
    id VARCHAR(36) NOT NULL PRIMARY KEY,
    kind VARCHAR(10) NOT NULL,
    permission_reference VARCHAR(2000) NOT NULL,
    payload LONGTEXT NOT NULL
);
CREATE INDEX idx_cash_catalog_kind ON cash_catalog_snapshots (kind);
