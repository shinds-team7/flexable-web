# 공식 공시 수집 HTTP 검증

공개 JSON 확장 후에는 FSB 전체 조회의 이중 인코딩 폼·전체 건수, 삼성 RP/발행어음의 분리 조회와 부분 실패, KB·신한·메리츠·케이뱅크·SK·SC JSON 요청, 제주 전체 목록과 개별 상세 실패 시 기존본 보존까지 검증한다. JSON Accept와 실제 공개 조회의 필드·메서드·Content-Type도 검사한다. 합성 HTML의 오래된 높은 금리를 실제 JSON 대신 선택하지 않는지 순수 파서 테스트로 확인한다. 선택적 실제 검증은 GET/POST 공개 읽기 요청이며 `CASH_LIVE_SOURCES=SC,JEJU`처럼 enum 이름으로 출처를 제한할 수 있다. 미지정 시 연결된 전체 출처를 읽는다.

운영 기관이나 운영 DB에 장애를 일으키지 않고 실제 `OfficialCashClient` → `CashCatalogJob` → H2 스냅샷 저장을 실행한다. mock의 HTML·금리는 합성 자료이며 운영에 넣지 않는다. 기관 소유 mock·계약이 없어 현재 공식 페이지에서 확인한 표 구조와 저장소 호출 방식에 맞춘 로컬 stand-in이다. Postman CLI 1.73.0은 스킬의 `status` 명령이 없어 소유자 검색을 수행하지 않았다. 클라우드 push·배포·공유는 하지 않는다.

별도 터미널에서:

```powershell
postman simulation run postman/simulations/official-cash.sim.yaml --port 4510 --no-history --output ndjson
```

Java 21 셸에서:

```powershell
$env:CASH_SIMULATION_URL = 'http://127.0.0.1:4510/official'
./backend/gradlew.bat -p backend test --tests '*OfficialCashSimulationTest' --rerun-tasks
Remove-Item Env:CASH_SIMULATION_URL
```

`/_mode`는 로컬 시뮬레이션 제어 전용이다. 정상·은행만 503·HTML 구조 변경·robots 제한·302·응답 크기 초과를 실행한다. 저축은행 전체 다운로드 폼 POST와 EUC-KR 헤더 응답도 합성 자료로 검증한다. `/_pages`와 CLI의 request 이벤트로 실제 호출과 robots 차단 후 상품 요청 부재를 확인한다. 새 실행은 초기 상태로 시작한다. 로그에는 합성 자료만 사용하며 커밋하지 않는다.

실제 공식 페이지 검증은 별도 opt-in이다. 현재 출처를 다시 GET하므로 반복 실행하지 않는다. 테스트 DB는 `cash-live` H2 메모리이며 실제 운영 DB를 쓰지 않는다.

```powershell
$env:CASH_LIVE_CHECK = 'true'
# 공식 화면에서 독립적으로 확인한 FSB 전체 건수를 대조할 경우에만 지정한다.
$env:CASH_FSB_EXPECTED_COUNT = '158' # 2026-11-04 조회 값. 이후 확인한 값으로 변경
./backend/gradlew.bat -p backend test --tests '*OfficialCashLiveTest' --rerun-tasks
Remove-Item Env:CASH_LIVE_CHECK
Remove-Item Env:CASH_FSB_EXPECTED_COUNT
```

기본 빌드에서는 이 두 opt-in 테스트를 건너뛰고 순수 파서·robots 테스트와 기존 정책·계약 테스트를 실행한다. Gradle test는 worker 프로필의 CashCatalogJob도 끄므로 테스트 컨텍스트 시작이 기관 수집으로 이어지지 않는다. 실데이터 opt-in만 클라이언트를 명시적으로 호출하며 운영 worker 설정은 그대로다. 실제 기관의 장래 페이지 구조나 장애 응답을 시뮬레이션이 보증하지는 않는다.
