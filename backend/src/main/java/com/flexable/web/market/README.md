# market
종목·일별 시세·사건(급등락) 데이터와 조회 API. 수집은 `ingest`가 하고 이 패키지는 저장·조회 인터페이스를 제공한다. 계산 정의는 `docs/product/03-architecture.md` 6장.
사건은 `EventDetector`(03 C-8 v1, 순수 함수)로 찾고 `EventService`가 `market_events`·`event_sources`에 저장·조회한다. 시장 사건은 시장 대용 종목(`app.market.index-proxy`)에 붙인다. 근거 공시는 `ingest`가 받아 `EventService.saveEvidence`로 넣는다.
