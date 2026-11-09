-- 배치고사 공시 AI 요약(decisions/2026-11-09-placement-ai-summary, policies §8-8 "공시 AI 요약"). 만드는 것은 worker(PlacementSummaryJob)이고 api는 읽기만 한다.
-- OpenDART 공시서류원본파일 본문 글을 Gemini로 요약해 자동 검사를 통과한 요약만 summary에 둔다. 원문·본문 글은 저장하지 않는다. 공개 자료이고 회원 정보는 없다.
-- summary가 NULL이면 만들어 봤지만 쓸 요약이 없음(reason: 검사에 걸린 까닭 또는 NO_TEXT 원문 없음). 같은 작성 규칙 버전(version)이면 다시 부르지 않는다.
-- hidden: 운영자 숨김. TRUE로 바꾸면 새 문제에 싣지 않고 버전이 바뀌어도 다시 만들지 않는다
CREATE TABLE dart_disclosure_summaries (
    receipt_no VARCHAR(14)  NOT NULL,
    summary    VARCHAR(600) NULL,
    reason     VARCHAR(20)  NULL,
    version    VARCHAR(30)  NOT NULL,
    model      VARCHAR(60)  NULL,
    hidden     BOOLEAN      NOT NULL DEFAULT FALSE,
    created_at DATETIME(6)  NOT NULL,
    PRIMARY KEY (receipt_no)
);
