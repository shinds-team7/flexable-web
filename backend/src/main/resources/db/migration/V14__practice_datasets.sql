-- 신규 시뮬레이션의 공개 시장 자료. 사용자 세션·투자금·선택 기록은 저장하지 않는다.
CREATE TABLE practice_datasets (
    code VARCHAR(12) NOT NULL PRIMARY KEY,
    payload LONGTEXT NOT NULL
);
