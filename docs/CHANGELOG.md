# 문서 변경 이력

기준 문서(`AGENTS.md`·`docs/PRD.md`·`docs/policies.md`·`docs/contracts/`·`docs/decisions/`·`tests/policy/`)를 바꾼 PR은 여기에 한 줄을 더한다. 최신이 위다. `spec-change` 라벨 PR이 병합되면 작업 브랜치를 rebase하고 AI 세션을 새로 시작한다([작업 방식](decisions/2026-10-25-dev-process.md) §7).

형식: `- [#PR] 무엇이 바뀌었나 — 영향: 프론트·백엔드·앱·시연·전체`

## 2026-10-27

- [#89 구현 PR] 투자 인사이트 개편 결정을 구현 리뷰 피드백에 맞춰 고쳤다([결정](decisions/2026-10-26-invest-insight-redesign.md) 변경 기록). ③ 차트를 하나로 합치고 여러 종목은 기간 첫날 높이를 맞춰 겹친다(그리기 전용, 비율 숫자는 보이지 않음). ④ "표로 보기"를 빼고 `PRICE_PAST` 문구를 정했다. ⑧ 시장 띠 [멈춤/재생] 버튼을 빼고 차트 그리기→그라데이션→핀 순서 모션을 적었다. PRD F1·02 §5-4·§7-3을 맞췄다. ① 기간은 3개월·6개월·1년·3년으로 하고, [화면 기본값 결정](decisions/2026-10-27-screen-defaults.md) ①의 시작 시점 칩(1·3·5년·직접)을 대체한다고 두 기록에 적었다. 계약은 바뀌지 않는다 — 영향: 프론트
- [#103] 연동 회원이 홈에서 고친 시드머니를 앱에도 반영하기로 결정했다([결정](decisions/2026-10-27-seed-money-app-sync.md)). 계약: `PUT /me/seed-money/manual` 응답(`SeedMoneyResponse`)에 `appSync`(applied·failed, GET은 null) 추가. 정책 §1에 연동 회원 규칙·예시 2줄, 04 §5-2에 웹 → 앱 행, 방침 제2·3·4조 개정. 앱 서버 `PUT /internal/v1/web-links/{linkId}/seed-money`(앱 #189)가 필요하다 — 영향: 프론트·백엔드·앱
- [#108] 앱 웹 연동 계약 사본 `docs/contracts/vendor/web-link-api.yaml`과 대조 테스트 `AppSpecFixtureTest`(앱 스펙에 맞는 응답을 웹 클라이언트가 읽는지, 웹 요청이 스펙에 맞는지), 사본이 앱 원본과 같은지 보는 CI `app-contract`(필수 아님)를 추가했다. 계약 내용은 바뀌지 않았다 — 영향: 백엔드(앱이 연동 계약을 바꾸면 사본·클라이언트 갱신)
- [#106] 구현돼 있던 적금 API 5개(`/savings/products`·`/companies`·`/policies`·`/products/{id}`·`/simulate`)를 `web-api.yaml`에 추가하고 `ContractTest`가 응답을 검사한다. 응답은 구현 그대로이고 바뀐 동작은 없다. 목 서버용 `example`(시드머니·종목 목록·적금 목록·청년 소식)을 달고 테스트로 검사한다. 프론트 화면 타입을 생성 타입과 대조하는 `src/lib/contractChecks.ts`를 더했고, 그 과정에서 찾은 null 가능 필드(사건 상세 `name`·`newsSearchUrl`, 투자 결과 `sources[].note`)를 화면 타입에 반영했다 — 영향: 프론트·백엔드
- [#110] 문서의 구현 상태를 2026-10-27 `main`에 맞췄다: PRD F2(일반 적금 구현)·머지된 #60·#62·사건 퀴즈(#88 구현), 정책 §5 제목(링크 앵커 변경)·상태, 사건 퀴즈 결정 기록 상태와 "현재 구현"(자료는 `practice_datasets` 묶음 저장, 운영 검증 전), 계약 `practice` 태그 설명·`/practice/*` 요약의 "구현 예정" 제거, `practice.json` 상태 `IMPLEMENTED`, README 경로 표 `/invest`·`/simulation`·상단 메뉴(#98을 합침), backend README 패키지 표, 03 C-12·마이그레이션 V15, product README ADR-6. 결정 기록 없이 바뀐 화면 세 가지(기간 칩 5년, 플러스 월간 기본, 섞어보기 메뉴 제거)를 [결정](decisions/2026-10-27-screen-defaults.md)으로 남겼다. 규칙·계약 내용은 바뀌지 않았다 — 영향: 전체(읽는 문서)

## 2026-10-26

- [#90] 투자 인사이트(`/invest`) 개편 스펙을 제안했다([결정](decisions/2026-10-26-invest-insight-redesign.md)). 세로축을 주가(원)로 바꾸고 금액 계산 UI는 이 화면에서 뺀다. 화면 차트용 일별 종가 제공을 허용하고(10-24 결정 ① 일부 변경), `GET /market/instruments/{id}/prices`·`/events`·`/market/indices`(시장 띠 9칸: 국내외 지수·금·환율, 해외·금·환율 수집은 #94)·`/market/industries` 계약을 추가했다(구현 전). 02 §7-3에 이 화면만 스크롤·흐르는 시장 띠 모션 예외를 두고, PRD F1·F5를 고쳤다. `/simulations/run`은 바뀌지 않는다 — 영향: 프론트·백엔드(스펙 병합 후 구현)
- [#93] 청년 소식을 사람 검수 없이 자동 게시하고 Gemini로 1~3문장 AI 요약을 붙이기로 결정했다([결정](decisions/2026-10-26-youth-news-auto-publish.md)). 계약 `/youth-news`: `summary` 추가, `benefit`·`action` null 허용, `preview` 삭제. PRD F4 상태·Must를 바꿨다 — 영향: 프론트·백엔드
- [#60] 투자 성향(안정형·균형형·성장형) 안내를 결정했다([결정](decisions/2026-10-26-investor-type.md)). 사용자가 고른 성향에 맞춰 상품 유형과 실제 상품을 객관 기준으로 나열하는 것을 허용하고("추천" 문구 금지는 유지), 성향 이름 금지는 F3 프리셋에만 남겼다(`AGENTS.md`·`PRD.md`·01·02). 화면 `/type`·`/type/:id`, 브라우저 저장 `fx.investorType` — 영향: 프론트·시연(백엔드는 회원 저장 계약을 추가할 때)
- [#86] 투자 인사이트 분리와 신규 사건 퀴즈 시뮬레이션의 구현 전 계약·정책·예시·데이터 보충 계획을 추가했다. 기존 투자 화면·계산은 바꾸지 않았다. 진행은 다음 사건까지 한 번에(`frames`로 날마다의 자산) 받고 구간당 3초에 재생하며, 첫 사건 전 14거래일을 둔다 — 영향: 프론트·백엔드(스펙 검토·병합 후 구현)
- [#47] 청년 소식 `GET /youth-news`(로그인 없음, 승인된 소식만)를 `web-api.yaml`에 추가하고 `ContractTest`가 응답을 검사한다. 응답은 #47 구현 그대로이고 바뀐 동작은 없다 — 영향: 프론트·백엔드

## 2026-10-25

- [#73] 앱 연동 `/internal/v1/web-links/*` 계약 링크를 앱 `docs/API.md`에서 앱 `docs/contracts/web-link-api.yaml`(OpenAPI 정본, 앱 #136)로 바꿨다(`AGENTS.md`·`docs/contracts/README.md`·`web-api.yaml` 설명·PR 템플릿·04). 계약 내용은 바뀌지 않았다 — 영향: 백엔드(`applink`를 고칠 때 앱 스펙 기준)
- [#71] `main` 보호 규칙을 적용하고(PR·CI·`issue-link`·`spec-change` 필수, CODEOWNERS 경로 리드 승인, 관리자 우회), 작업 방식 결정 기록과 HANDOFF에 반영했다 — 영향: 전체(이제 `main`에 직접 push 불가, PR에 Issue 번호 필요)
- [#69] 웹 API 계약을 `docs/contracts/web-api.yaml`(OpenAPI)로 옮겼다. `backend/README.md` 표는 요약이 됐다. 백엔드 `ContractTest`가 응답을 검사하고, 프론트 타입(`npm run gen:api`)·목 서버(`npm run mock:api`·`dev:mock`)를 추가했다. 실제 동작에 맞춰 `DELETE /me` 비밀번호 오류는 401 `INVALID_CREDENTIALS`로 적었다 — 영향: 프론트·백엔드(응답을 바꿀 때 스펙 먼저)
- [#67] `docs/PRD.md`(목표·사용자·기능 현재 상태·범위)와 `docs/policies.md`(시드머니·투자 시뮬레이션·목표·AI 안내 규칙 + 예시 표)를 추가하고, 예시 표를 `tests/policy/*.json` + `GoalPolicyTest`·`SimulationPolicyTest`로 묶었다. 계산 규칙 자체는 바뀌지 않았다 — 영향: 백엔드·프론트(참고 문서)
- [#65] 작업 방식 도입: 루트 `AGENTS.md`를 작업 시작 전·중·완료 시 형식으로 다시 쓰고 `backend/AGENTS.md`를 추가했다. Issue·PR 템플릿, `CODEOWNERS`, `spec-change` 라벨, PR 규칙 검사(`pr-rules`), `docs/decisions/`, 이 파일을 추가했다 — 영향: 전체(새 AI 세션 필요)
