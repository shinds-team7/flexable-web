# 문서 변경 이력

기준 문서(`AGENTS.md`·`docs/PRD.md`·`docs/policies.md`·`docs/contracts/`·`docs/decisions/`·`tests/policy/`)를 바꾼 PR은 여기에 한 줄을 더한다. 최신이 위다. `spec-change` 라벨 PR이 병합되면 작업 브랜치를 rebase하고 AI 세션을 새로 시작한다([작업 방식](decisions/2026-10-25-dev-process.md) §7).

형식: `- [#PR] 무엇이 바뀌었나 — 영향: 프론트·백엔드·앱·시연·전체`

## 2026-10-26

- [#86] 투자 인사이트 분리와 신규 사건 퀴즈 시뮬레이션의 구현 전 계약·정책·예시·데이터 보충 계획을 추가했다. 기존 투자 화면·계산은 바꾸지 않았다. 진행은 다음 사건까지 한 번에(`frames`로 날마다의 자산) 받고 구간당 3초에 재생하며, 첫 사건 전 14거래일을 둔다 — 영향: 프론트·백엔드(스펙 검토·병합 후 구현)
- [#47] 청년 소식 `GET /youth-news`(로그인 없음, 승인된 소식만)를 `web-api.yaml`에 추가하고 `ContractTest`가 응답을 검사한다. 응답은 #47 구현 그대로이고 바뀐 동작은 없다 — 영향: 프론트·백엔드

## 2026-10-25

- [#73] 앱 연동 `/internal/v1/web-links/*` 계약 링크를 앱 `docs/API.md`에서 앱 `docs/contracts/web-link-api.yaml`(OpenAPI 정본, 앱 #136)로 바꿨다(`AGENTS.md`·`docs/contracts/README.md`·`web-api.yaml` 설명·PR 템플릿·04). 계약 내용은 바뀌지 않았다 — 영향: 백엔드(`applink`를 고칠 때 앱 스펙 기준)
- [#71] `main` 보호 규칙을 적용하고(PR·CI·`issue-link`·`spec-change` 필수, CODEOWNERS 경로 리드 승인, 관리자 우회), 작업 방식 결정 기록과 HANDOFF에 반영했다 — 영향: 전체(이제 `main`에 직접 push 불가, PR에 Issue 번호 필요)
- [#69] 웹 API 계약을 `docs/contracts/web-api.yaml`(OpenAPI)로 옮겼다. `backend/README.md` 표는 요약이 됐다. 백엔드 `ContractTest`가 응답을 검사하고, 프론트 타입(`npm run gen:api`)·목 서버(`npm run mock:api`·`dev:mock`)를 추가했다. 실제 동작에 맞춰 `DELETE /me` 비밀번호 오류는 401 `INVALID_CREDENTIALS`로 적었다 — 영향: 프론트·백엔드(응답을 바꿀 때 스펙 먼저)
- [#67] `docs/PRD.md`(목표·사용자·기능 현재 상태·범위)와 `docs/policies.md`(시드머니·투자 시뮬레이션·목표·AI 안내 규칙 + 예시 표)를 추가하고, 예시 표를 `tests/policy/*.json` + `GoalPolicyTest`·`SimulationPolicyTest`로 묶었다. 계산 규칙 자체는 바뀌지 않았다 — 영향: 백엔드·프론트(참고 문서)
- [#65] 작업 방식 도입: 루트 `AGENTS.md`를 작업 시작 전·중·완료 시 형식으로 다시 쓰고 `backend/AGENTS.md`를 추가했다. Issue·PR 템플릿, `CODEOWNERS`, `spec-change` 라벨, PR 규칙 검사(`pr-rules`), `docs/decisions/`, 이 파일을 추가했다 — 영향: 전체(새 AI 세션 필요)
