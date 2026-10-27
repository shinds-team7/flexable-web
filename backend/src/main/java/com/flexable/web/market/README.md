# market
종목·일별 시세·사건(급등락) 데이터와 조회 API. 수집은 `ingest`가 하고 이 패키지는 저장·조회 인터페이스를 제공한다. 계산 정의는 `docs/product/03-architecture.md` 6장.
사건은 `EventDetector`(03 C-8 v1, 순수 함수)로 찾고 `EventService`가 `market_events`·`event_sources`에 저장·조회한다. 시장 사건은 시장 대용 종목(`app.market.index-proxy`)에 붙인다. 근거 공시는 `ingest`가 받아 `EventService.saveEvidence`로 넣는다.
투자 인사이트 조회(`MarketInsightService`): 화면 차트용 일별 종가·기간 사건·시장 띠(`market_index_daily`, `IndexKey` 순서)·업종별 목록(`instruments.industry_name`). 시가·고가·저가·거래량은 내려 주지 않는다([결정](../../../../../../../../docs/decisions/2026-10-26-invest-insight-redesign.md) ④). 가짜 소스(이름이 `테스트용`으로 시작) 자료는 `isSample=true`다.
