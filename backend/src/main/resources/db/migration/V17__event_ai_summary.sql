-- market: 사건 AI 개요(decisions/2026-10-29-event-ai-summary).
-- worker가 사건 탐지·공시 근거 수집 뒤 Gemini로 1~3문장 개요를 미리 만들어 넣는다. 사람 검수 없이 자동 검사를 통과한 문장만 저장하고
-- 화면에 "AI 요약"으로 표시한다. api는 읽기만 한다(요청 중 AI 호출 없음).
-- ai_summary_hash: 개요를 만들 때 본 입력(종목명·기간·등락률·시장 대비·거래량 배수·공시 제목)의 지문. 입력이 바뀌면 다시 만든다.
--   검사에서 버린 개요도 hash는 남겨 같은 입력으로 다시 부르지 않는다(ai_summary는 NULL)
-- ai_summary_sample: 예시 작성기(EVENT_OVERVIEW_SOURCE=fake)가 쓴 문장. 화면은 "AI 요약" 대신 "예시"로 보인다
-- ai_summary_hidden: 운영자가 공개를 멈춘 개요. TRUE면 api가 내려 주지 않고 worker도 다시 만들지 않는다
ALTER TABLE market_events ADD COLUMN ai_summary VARCHAR(400) NULL;
ALTER TABLE market_events ADD COLUMN ai_summary_model VARCHAR(60) NULL;
ALTER TABLE market_events ADD COLUMN ai_summary_hash VARCHAR(64) NULL;
ALTER TABLE market_events ADD COLUMN ai_summary_at DATETIME(6) NULL;
ALTER TABLE market_events ADD COLUMN ai_summary_sample BOOLEAN NOT NULL DEFAULT FALSE;
ALTER TABLE market_events ADD COLUMN ai_summary_hidden BOOLEAN NOT NULL DEFAULT FALSE;
