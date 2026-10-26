-- news: 소식 카드 요약(2026-10-26 결정, docs/decisions/2026-10-26-youth-news-auto-publish.md).
-- worker가 수집 뒤 Gemini로 원문(정책설명·지원내용)을 1~3문장으로 요약해 넣는다. 사람 검수 없이 화면에 나가고 "AI 요약"으로 표시한다.
-- summary_hash: 요약할 때 본 원문의 content_hash. 원문이 바뀌면 다시 요약한다. 검사에서 버린 요약도 hash는 남겨 같은 원문을 다시 부르지 않는다
ALTER TABLE youth_news ADD COLUMN summary VARCHAR(300) NULL;
ALTER TABLE youth_news ADD COLUMN summary_hash VARCHAR(64) NULL;
ALTER TABLE youth_news ADD COLUMN summarized_at DATETIME(6) NULL;
