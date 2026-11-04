# 공식 공시 수집 HTTP 검증

운영 기관이나 운영 DB에 장애를 일으키지 않고 실제 `OfficialCashClient` → `CashCatalogJob` → H2 스냅샷 저장을 실행한다. mock의 HTML·금리는 합성 자료이며 운영에 넣지 않는다. 기관 소유 mock·계약이 없어 현재 공식 페이지에서 확인한 표 구조와 저장소 호출 방식에 맞춘 로컬 stand-in이다. Postman CLI 1.73.0은 스킬의 `status` 명령이 없어 소유자 검색을 수행하지 않았다. 클라우드 push·배포·공유는 하지 않는다.

별도 터미널에서:

```powershell
postman simulation run postman/simulations/official-cash.sim.yaml --port 4510 --no-history --output ndjson
```

Java 21 셸에서:

```powershell
$env:CASH_SIMULATION_URL = 'http://127.0.0.1:4510/official'
./backend/gradlew.bat -p backend test --tests '*OfficialCashSimulationTest'
Remove-Item Env:CASH_SIMULATION_URL
```

`/_mode`는 로컬 시뮬레이션 제어 전용이다. 정상·은행만 503·HTML 구조 변경·robots 제한·302·응답 크기 초과를 실행한다. `/_pages`와 CLI의 request 이벤트로 실제 호출과 robots 차단 후 상품 요청 부재를 확인한다. 새 실행은 초기 상태로 시작한다. 로그에는 합성 자료만 사용하며 커밋하지 않는다.

실제 공식 페이지 검증은 별도 opt-in이다. 현재 출처를 다시 GET하므로 반복 실행하지 않는다. 테스트 DB는 `cash-live` H2 메모리이며 실제 운영 DB를 쓰지 않는다.

```powershell
$env:CASH_LIVE_CHECK = 'true'
./backend/gradlew.bat -p backend test --tests '*OfficialCashLiveTest'
Remove-Item Env:CASH_LIVE_CHECK
```

기본 빌드에서는 이 두 opt-in 테스트를 건너뛰고 순수 파서·robots 테스트와 기존 정책·계약 테스트를 실행한다. 실제 기관의 장래 페이지 구조나 장애 응답을 시뮬레이션이 보증하지는 않는다.
