# ingest
외부 데이터 수집 작업(`worker` 프로필에서만 켜짐). 지금 구현은 시세 수집(`MarketSyncJob`)과 이어서 도는 사건 탐지·공시 근거(`MarketEventJob`)다. 실행 시점·소스·환경 변수는 `backend/README.md` "로컬 실행" 아래 설명이 정본이다.

- 실행: 켜질 때 한 번(`MARKET_SYNC_ON_START`, 기본 켬)과 평일 18:30 KST(`MARKET_SYNC_CRON`). 시세 수집이 끝나면 사건 탐지·공시 근거를 이어 돌린다.
- 소스: 일봉은 키움(`kiwoom`), 종목 목록은 KRX(`krx`, 시장별로 실패하면 키움 대체), 사건 근거는 OpenDART(`dart`). 시험용 `fake` 소스가 있다.
- 실행 기록: `ingest_runs`(job = `market-sync`·`market-events`, `SUCCESS`·`PARTIAL`·`FAILED`).
- 실패 처리: 한 시장·한 종목이 실패해도 나머지는 계속한다. 다음 실행은 마지막 거래일 10일 전부터 다시 받아 빠진 날·정정을 채운다. 공시는 한 번에 `DART_MAX_CALLS`건까지 처리하고 나머지는 다음 실행에서 잇는다.
- 아직 없는 것: 같은 작업의 중복 실행 방지는 프로세스 안 `synchronized`뿐이다(worker 여러 대·DB 작업 잠금 없음). 호출 단위 자동 재시도·실패 지점부터 이어 받기, 폐쇄망용 스냅숏 적재는 구현돼 있지 않다.
