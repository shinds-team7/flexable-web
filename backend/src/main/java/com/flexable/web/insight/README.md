# insight
**계획만 있고 아직 코드가 없다.** 사건 설명(LLM 초안)을 검수 상태(DRAFT/APPROVED/REJECTED)와 함께 저장하고 화면에는 APPROVED만 내보낼 자리다. 요청 중 실시간 생성은 하지 않는다.

지금 사건 상세(`GET /api/v1/market/events/{id}`)의 `whatHappened`는 `market.EventDtos.whatHappened`가 수치(기간·등락률·같은 기간 시장·공시 수)로 만든 사실 문장이고 `aiGenerated=false`, `whyItMoved`는 빈 목록이다.
