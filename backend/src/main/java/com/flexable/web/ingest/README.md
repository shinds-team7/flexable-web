# ingest
외부 데이터 수집 작업(`worker` 프로필에서만 켜짐). 지금 구현은 시장 띠(`IndexSyncJob`, 키움·KRX·수출입은행 8칸, 맨 먼저)·시세 수집(`MarketSyncJob`)과 이어서 도는 사건 탐지·공시 근거(`MarketEventJob`)·업종과 시뮬레이션 자료(`PracticeSyncJob`), 적금 공시·청년정책 수집(`SavingsSnapshotJob`, 아래 savings-snapshot)이다. 실행 시점·소스·환경 변수는 `backend/README.md` "로컬 실행" 아래 설명이 정본이다.

- 실행: 켜질 때 한 번(`MARKET_SYNC_ON_START`, 기본 켬)과 평일 18:30 KST(`MARKET_SYNC_CRON`). 시세 수집이 끝나면 사건 탐지·공시 근거를 이어 돌리고, 이어서 사건 AI 개요(`EventOverviewJob`, `EventOverviewWriter` 구현 `gemini.GeminiEventOverviewWriter`·예시 `fake.FakeEventOverviewWriter`, ingest_runs `event-overview`)를 만든다([결정](../../../../../../../../docs/decisions/2026-10-29-event-ai-summary.md)).
- 소스: 일봉은 키움(`kiwoom`), 종목 목록은 KRX(`krx`, 시장별로 실패하면 키움 대체), 사건 근거는 OpenDART(`dart`). 시험용 `fake` 소스가 있다.
- 실행 기록: `ingest_runs`(job = `market-sync`·`market-events`·`index-sync`, `SUCCESS`·`PARTIAL`·`FAILED`).
- 실패 처리: 한 시장·한 종목이 실패해도 나머지는 계속한다. 다음 실행은 마지막 거래일 10일 전부터 다시 받아 빠진 날·정정을 채운다. 공시는 한 번에 `DART_MAX_CALLS`건까지 처리하고 나머지는 다음 실행에서 잇는다.
- 아직 없는 것: 같은 작업의 중복 실행 방지는 프로세스 안 `synchronized`뿐이다(worker 여러 대·DB 작업 잠금 없음). 호출 단위 자동 재시도·실패 지점부터 이어 받기, 폐쇄망용 스냅숏 적재는 구현돼 있지 않다.

## youth-collect · youth-summary (구현됨)
청년 소식(`YouthNewsSyncJob`). 켜질 때 한 번(`YOUTH_SYNC_ON_START`)과 매일 06:00 KST(`YOUTH_SYNC_CRON`).
- `youth-collect`: 온통청년 `getPlcy` 전체를 받아 `news.NewsService.saveCollected`로 원문·카드를 넣는다. 카드는 검수 없이 화면에 나간다(2026-10-26 결정).
- `youth-summary`: 이어서 `NewsSummarizer`(구현 `gemini.GeminiNewsSummarizer`)로 요약하지 않았거나 원문이 바뀐 카드를 `GEMINI_BATCH_SIZE`건씩 묶어 요약한다. 한 번 실행에 `GEMINI_MAX_CALLS`번까지, 호출이 실패하면(한도 초과 등) 멈추고 다음 실행에 잇는다. 검사(원문에 없는 숫자·길이·금지어)를 통과하지 못한 요약은 `null`로 저장한다. `GEMINI_API_KEY`가 비어 있으면 건너뛴다.
- 실행 기록: `ingest_runs`(job = `youth-collect`·`youth-summary`).

## savings-snapshot (구현됨)
finlife `savingProductsSearch.json`(은행 020000 · 저축은행 030300)을 받아 `savings.SavingsCatalogService.replaceAll`로 반영한다. 매일 10:00(KST), 시작할 때 DB가 비어 있으면 한 번 바로.
- 켜기: `SAVINGS_INGEST_ENABLED=true`(worker 프로필은 기본 켜짐). 인증키는 환경변수 `FINLIFE_API_KEY`로만 넣는다(저장소 공개, 키가 없으면 건너뜀).
- 청년정책(온통청년 `getPlcy`): 정책명에 적금·저축·통장·계좌·자산형성·재형이 들어간 정책만 이름 검색으로 모아 `savings_policies`(V11)에 반영한다. 인증키는 `YOUTHCENTER_API_KEY`. 서버가 가끔 500을 주어 쪽마다 3번까지 다시 시도한다.
- finlife는 HTTPS이고 User-Agent가 없으면 연결을 끊는다. 실패하면 기존 데이터를 그대로 두고 다음 주기에 다시 한다.
- 로컬 확인: `FINLIFE_API_KEY=… YOUTHCENTER_API_KEY=… SAVINGS_INGEST_ENABLED=true ./gradlew bootRun --args='--spring.profiles.active=local'`
