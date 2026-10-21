# ingest
외부 데이터 수집 작업 공통(실행 기록, 중복 실행 방지, 재시도). `worker` 프로필에서만 활성화한다. 폐쇄망에서는 끄고 스냅숏을 쓴다.

## savings-snapshot (구현됨)
finlife `savingProductsSearch.json`(은행 020000 · 저축은행 030300)을 받아 `savings.SavingsCatalogService.replaceAll`로 반영한다. 매일 10:00(KST), 시작할 때 DB가 비어 있으면 한 번 바로.
- 켜기: `SAVINGS_INGEST_ENABLED=true`(worker 프로필은 기본 켜짐). 인증키는 환경변수 `FINLIFE_API_KEY`로만 넣는다(저장소 공개, 키가 없으면 건너뜀).
- 청년정책(온통청년 `getPlcy`): 정책명에 적금·저축·통장·계좌·자산형성·재형이 들어간 정책만 이름 검색으로 모아 `savings_policies`(V7)에 반영한다. 인증키는 `YOUTHCENTER_API_KEY`. 서버가 가끔 500을 주어 쪽마다 3번까지 다시 시도한다.
- finlife는 HTTPS이고 User-Agent가 없으면 연결을 끊는다. 실패하면 기존 데이터를 그대로 두고 다음 주기에 다시 한다.
- 로컬 확인: `FINLIFE_API_KEY=… YOUTHCENTER_API_KEY=… SAVINGS_INGEST_ENABLED=true ./gradlew bootRun --args='--spring.profiles.active=local'`
