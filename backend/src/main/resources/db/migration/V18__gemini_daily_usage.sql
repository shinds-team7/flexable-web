-- ingest: worker가 부른 Gemini 호출 수(KST 날짜·용도별, decisions/2026-10-29-event-ai-summary ⑦).
-- 부르기 전에 조건부로 하나 늘려(count < 하루 상한) 다시 켜도 그날 센 수가 남는다. 회원 정보는 없다.
-- purpose: event-overview(사건 AI 개요)
CREATE TABLE gemini_daily_usage (
    usage_date DATE NOT NULL,
    purpose VARCHAR(30) NOT NULL,
    count INT NOT NULL DEFAULT 0,
    PRIMARY KEY (usage_date, purpose)
);
