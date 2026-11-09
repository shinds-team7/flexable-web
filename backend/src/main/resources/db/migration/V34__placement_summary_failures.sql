-- 배치고사 공시 AI 요약에서 원문 받기(OpenDART 공시서류원본파일)에 실패한 공시(PlacementSummaryJob, #361 리뷰). 다음 실행은 실패하지 않은 공시를 먼저 하고
-- 실패한 공시는 오래 전에 실패한 순으로 맨 뒤에 다시 받는다. 같은 공시가 계속 실패해도 한 번 실행의 대상(batchSize × maxCalls)을 다 차지하지 않게 한다.
-- 요약 결과를 저장하면(요약·검사 탈락·원문 없음) 행을 지운다. 공개 자료 수집 기록이고 회원 정보는 없다
CREATE TABLE dart_summary_failures (
    receipt_no VARCHAR(14)  NOT NULL,
    attempts   INT          NOT NULL,
    error      VARCHAR(300) NULL,
    failed_at  DATETIME(6)  NOT NULL,
    PRIMARY KEY (receipt_no)
);
