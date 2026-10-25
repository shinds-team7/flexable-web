# 작업 방식: 저장소 기준본·Issue 단위·spec-change 절차

- 날짜: 2026-10-25 · 결정한 사람: SXXNHU(팀 개발 진행 가이드 반영) · 관련: Issue #64
- 영향: 전체(웹 프론트·웹 백엔드·앱 저장소·각자의 AI 세션)

팀 개발 진행 가이드를 이 저장소에 맞게 옮긴 기록이다. 앱 저장소(flexable-app)도 같은 규칙을 쓰고, 경로만 그 저장소에 맞춘다.

## 1. 기준본은 Git 저장소 하나

- 개발을 시작한 뒤에는 **저장소의 `docs/`가 유일한 기준본**이다. 매니페스트는 초기 기획 기록으로만 남기고 더 이상 고치지 않는다.
- 기획을 바꿔야 하면 저장소에 **문서 PR**을 올린다. 회의·메신저에서 합의한 내용도 PR로 반영되기 전까지는 개발 기준이 아니다.
- 각자의 AI에게 PRD를 붙여 넣지 않는다. AI가 저장소 문서를 직접 읽게 한다.
- 이유: 두 곳에서 문서를 고치면 기준본이 둘이 된다. 저장소로 모으면 코드와 정책 변경을 같은 PR에서 검토할 수 있고, 어떤 구현이 어느 문서 버전을 기준으로 했는지 커밋으로 추적할 수 있다.

## 2. 파일 구조

| 가이드 | 이 저장소 | 상태 |
|---|---|---|
| `AGENTS.md`: 공통 작업 규칙·참고 문서 위치·검증 방법 | 루트 `AGENTS.md`(`CLAUDE.md`는 `@AGENTS.md`로 참조) | 있음 |
| 파트별 `AGENTS.md`: 빌드·테스트 명령, 컨벤션 | `backend/AGENTS.md`. 웹 프론트는 루트 `src/`라 루트 파일에 둔다 | 있음 |
| `docs/PRD.md`: 서비스 목표·사용자·핵심 기능·개발 범위 | `docs/PRD.md`(01 기획서에서 요약) | 있음 |
| `docs/policies.md`: 계산·상태 규칙 + 입력→기대값 예시 표 | `docs/policies.md`(시드머니·투자 시뮬레이션·목표·AI 안내) | 있음 |
| `docs/contracts/*.yaml`: API 계약(OpenAPI) | `docs/contracts/web-api.yaml`(브라우저–웹 백엔드). 백엔드 `ContractTest`가 검사, 프론트 타입 `npm run gen:api`·목 서버 `npm run mock:api`. 웹–앱 서버 간 `/internal/v1`은 앱 저장소 계약을 따른다 | 있음 |
| `docs/CHANGELOG.md`: 문서 변경 이력 | `docs/CHANGELOG.md` | 있음 |
| `docs/decisions/`: 주요 결정 기록 | `docs/decisions/`. 10-24까지는 `docs/product/decisions.md` | 있음 |
| `tests/policy/`: 정책 예시 표를 옮긴 공통 테스트 | `tests/policy/*.json` + 백엔드 `GoalPolicyTest`·`SimulationPolicyTest`가 읽어 검사 | 있음 |

우리 구조에는 FastAPI 서버가 없다. 웹 백엔드(Spring)가 OpenAI를 직접 부르고, 실패할 때의 응답 형식(`fallbackReason`)은 [goal-ai.md](../product/goal-ai.md)에 정해져 있다. 이 형식도 계약에 옮긴다.

## 3. API 계약은 OpenAPI 스펙으로

- 계약은 마크다운이 아니라 `docs/contracts/` 아래 OpenAPI yaml로 쓴다(토스페이먼츠 개발자센터 표기와 같은 OAS, 스웨거 스펙과 같음).
- 프론트는 스펙에서 타입과 목 서버를 만들어, 백엔드가 완성되기 전에도 개발한다.
- 백엔드는 계약 테스트를 둬서, 응답이 스펙과 다르면 CI가 실패하게 한다.
- 정책은 `docs/policies.md`에 규칙과 입력→기대값 예시 표를 적고, 같은 내용을 `tests/policy/` 테스트 케이스로 옮긴다.

## 4. AGENTS.md 작성 규칙

- PRD 전체가 아니라 "무엇을 읽고 어떻게 작업할지"만 적는다. 짧게 유지한다(길면 일부가 반영되지 않는다).
- Codex는 세션을 시작할 때 저장소 루트부터 현재 작업 폴더까지의 `AGENTS.md`를 누적해서 읽는다. 루트에는 공통 규칙을, 파트 폴더에는 파트별 규칙을 둔다.
- Claude를 쓰는 사람을 위해 `CLAUDE.md`는 `AGENTS.md`를 참조만 한다(기준본은 하나).

## 5. 작업은 Issue 단위로

- AI에게는 작은 Issue 하나씩 맡긴다. 같은 파트의 두 사람은 기능을 Issue로 나눠 각자 맡는다. 예를 들면 한 명은 API, 한 명은 화면과 API 연결을 맡고, OpenAPI로 응답 형식을 먼저 합의한 뒤 프론트는 목 서버로 동시에 진행한다.
- Issue에는 **목표 · 참고 자료 · 범위 · 완료 조건** 네 칸을 쓴다(Issue 템플릿). 완료 조건은 가능하면 "어떤 테스트 통과"로 적는다.
- 같은 파일을 동시에 고치는 일이 잦으면 작업 경계를 더 잘게 나눈다.

## 6. 리뷰 규칙: CODEOWNERS·PR 템플릿·라벨

- 공통 정책·계약·지침은 리드(SXXNHU)가 확인하고 병합한다. 범위는 `.github/CODEOWNERS`에 있다.
- PR 템플릿에는 Issue, 변경 내용, 참고한 문서, 영향받는 파트, **정책에 없어서 새로 내린 결정**, 검증 결과를 쓴다.
- 문서·계약·정책·지침을 바꾸는 PR에는 `spec-change` 라벨을 붙인다. 긴급 수정으로 Issue가 없으면 `no-issue` 라벨과 사유를 적는다.
- `pr-rules` 워크플로가 검사한다.
  - Issue 번호가 없는 PR은 실패한다.
  - 기준 문서를 바꿨는데 `spec-change` 라벨이나 CHANGELOG 한 줄이 없으면 실패한다.
- `main` 보호(4단계): PR 필수, CI 통과 필수, CODEOWNERS 경로는 리드 리뷰 필수. 관리자는 우회할 수 있다.

## 7. 문서가 바뀌었을 때의 절차

1. 변경을 **문서 PR**로 올린다. 정책·계약·테스트를 같은 PR에서 함께 고치고 `docs/CHANGELOG.md`에 한 줄을 더한다.
2. `spec-change` 라벨을 붙이고 CODEOWNERS 리뷰를 받아 `main`에 병합한다. 병합되면 `pr-rules`가 열린 PR마다 안내 댓글을 단다.
3. 각자 작업 브랜치를 최신 `main`에 rebase한다.
4. CI 결과를 확인한다. 실패한 정책 테스트가 반영해야 할 지점이다.
5. **AI 세션을 새로 시작한다.** 진행 중인 세션을 이어 가야 하면 변경 문서를 다시 읽게 한다.
   > `docs/CHANGELOG.md`의 최신 항목을 읽고, 변경된 문서를 확인해서 현재 구현과 테스트에 필요한 변경을 먼저 정리해줘.

문서 업데이트와 AI의 인식 업데이트는 별개다. 문서를 pull해도 진행 중인 대화는 새 내용을 모른다. `AGENTS.md`는 세션을 시작할 때 읽히므로, 지침이 바뀌면 새 세션이 확실하다.

## 8. 개발 중 내린 결정도 문서로

- AI와 함께 정한 예외 처리나 상태값 추가 같은 결정이 코드에만 남으면 문서와 코드가 어긋나고, 그 문서를 기준으로 모두가 개발하게 된다.
- **작은 결정**은 PR 템플릿의 "정책에 없어서 새로 내린 결정" 칸에 적는다.
- **다른 파트에 영향을 주는 결정**은 `docs/decisions/`에 짧게 기록하고, 필요하면 정책·계약 문서 PR을 따로 연다.

## 적용 순서

| 단계 | 내용 | PR |
|---|---|---|
| 1 | 지침·템플릿·CODEOWNERS·라벨·PR 규칙 검사·CHANGELOG·decisions | #65 |
| 2 | `docs/PRD.md`, `docs/policies.md`(예시 표), `tests/policy/`(정책과 테스트는 같은 PR) | #67 |
| 3 | `docs/contracts/web-api.yaml`, 계약 테스트, 프론트 타입·목 서버 | #69 |
| 4 | `main` 브랜치 보호: 저장소 규칙 "main 보호". 삭제·강제 push 금지, PR 필수, CI `build`·`backend`·`issue-link`·`spec-change` 통과 필수, CODEOWNERS 경로는 리드 승인 필수(그 밖은 승인 없이 머지 가능), 저장소 관리자는 우회 가능 | 설정 완료 |
| 앱 | flexable-app에 같은 구조 적용(이 문서를 기준으로 앱 담당이 진행) | 앱 담당 |
