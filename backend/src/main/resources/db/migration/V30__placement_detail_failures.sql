-- 배치고사 공시 주요 내용 수집에서 실패한 종목·API 묶음(DisclosureDetailJob). 다음 실행은 실패하지 않은 묶음을 먼저 받고 실패한 묶음은 오래된 순으로 맨 뒤에 다시 받는다.
-- 같은 묶음이 계속 실패해도 호출 상한을 다 써서 뒤 종목이 막히지 않게 한다. 성공하면 행을 지운다. 공개 자료 수집 기록이고 회원 정보는 없다
CREATE TABLE dart_detail_failures (
    stock_code VARCHAR(12)  NOT NULL,
    api        VARCHAR(40)  NOT NULL,
    attempts   INT          NOT NULL,
    error      VARCHAR(300) NULL,
    failed_at  DATETIME(6)  NOT NULL,
    PRIMARY KEY (stock_code, api)
);
