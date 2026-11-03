# news
청년 금융 소식 저장·조회(01 §F4). 수집은 worker(`ingest.YouthNewsSyncJob`)가 `NewsService.saveCollected`로 넣고, 화면은 `GET /youth-news`로 읽는다.

- 수집한 소식은 사람 검수 없이 화면에 나간다(2026-10-26 결정, [결정 기록](../../../../../../../../docs/decisions/2026-10-26-youth-news-auto-publish.md)). 반려(`REJECTED`)한 것과 출처·지역이 빠진 것만 뺀다.
- 요약(`summary`)은 worker가 Gemini로 만들어 `applySummaries`로 넣는다. 대상은 `summaryTargets`(요약 안 함·원문 바뀜, 마감 전, 마감 임박순). 그사이 원문이 또 바뀌면 옛 요약은 넣지 않는다.
- 사람이 손댄(승인·반려) 카드는 다시 수집해도 덮어쓰지 않는다(원문만 갱신).
- 금액·기한은 원문 값만 쓰고, 원문에서 확인 못 한 값은 `null`이다(조건 없음이 아님). 나에게 얼마(`benefit`)·오늘 할 일(`action`)은 지금 비어 있다.
- 필터(나이·지역·분야)는 쿼리로만 받고 저장하지 않는다.
- 열람 집계(`NewsViewService`, [결정](../../../../../../../../docs/decisions/2026-11-03-news-hot.md)): `POST /youth-news/{id}/views`로 (소식, 임의 방문자 UUID, 날짜)당 한 건을 세고, `GET /youth-news/hot`이 최근 7일 서로 다른 방문자 수 순을 돌려준다. 계정·IP와 연결하지 않고 방문자 하루 40건 상한, 30일 지나면 `NewsViewCleanupJob`이 지운다. 구글 검색량은 쓰지 않는다(`basis=SITE`).
