# 공통 개발 지침(flexable-web)

텅장관리(Flex-able) 데스크톱 웹이다. 화면은 `src/`(Vite·React·TS), 웹 서버는 `backend/`(Spring)이고 앱과 서버·DB·계정을 따로 쓴다. 앱은 별도 저장소 [`shinds-team7/flexable-app`](https://github.com/shinds-team7/flexable-app)(문서의 "project2")다. 파트별 지침은 `backend/AGENTS.md`에 있다. 이 파일에는 무엇을 읽고 어떻게 작업할지만 적고, 제품 내용은 아래 문서에 둔다.

## 기준 문서(저장소가 유일한 기준본)

| 무엇 | 어디 |
|---|---|
| 서비스 목적·사용자·기능·범위 | [docs/PRD.md](docs/PRD.md) (근거·화면·구조는 [docs/product/](docs/product/README.md) 01~04) |
| 계산·상태 규칙과 예시 표 | [docs/policies.md](docs/policies.md) = [tests/policy/](tests/policy/) 테스트 |
| API 계약(OpenAPI) | 웹 [docs/contracts/web-api.yaml](docs/contracts/web-api.yaml)(정본, 사용법 [README](docs/contracts/README.md)). 앱 연동 `/internal/v1/web-links/*`는 [앱 docs/contracts/web-link-api.yaml](https://github.com/shinds-team7/flexable-app/blob/main/docs/contracts/web-link-api.yaml)(앱 저장소 정본) |
| 결정 기록 | 새 결정은 [docs/decisions/](docs/decisions/), 10-18~10-24 결정은 [docs/product/decisions.md](docs/product/decisions.md) |
| 문서 변경 이력 | [docs/CHANGELOG.md](docs/CHANGELOG.md) |
| 진행 현황·할 일 | [docs/product/HANDOFF.md](docs/product/HANDOFF.md) |
| 개인정보처리방침 | [src/pages/Privacy.tsx](src/pages/Privacy.tsx), 근거 [docs/product/privacy-web.md](docs/product/privacy-web.md) |
| 작업 방식 자체 | [docs/decisions/2026-10-25-dev-process.md](docs/decisions/2026-10-25-dev-process.md) |

회의·메신저에서 합의한 내용과 채팅에 붙여 넣은 기획은 PR로 저장소에 반영되기 전까지 개발 기준이 아니다. 저장소 문서와 다르면 저장소를 따르고 차이를 알린다. 기획 문서의 계획을 현재 구현으로 오인하지 않는다(각 문서의 "현재 구현" 상자 확인).

## 작업 시작 전

- 이번 Issue의 목표·참고 자료·범위·완료 조건을 읽는다. Issue가 없으면 범위와 완료 조건부터 확인한다.
- `docs/PRD.md`에서 목적과 범위를, Issue와 관련된 `docs/policies.md` 항목과 API 계약을 저장소에서 직접 읽는다.
- `docs/CHANGELOG.md` 최근 항목을 확인한다.
- 구현 전에 작업 범위, 참고한 문서, 완료 조건을 요약한다.

## 작업 중

- 문서끼리 충돌하거나 정책이 없으면 임의로 확정하지 않고 알린다.
- 작업 요청 없이 `docs/` 문서를 고치지 않는다.
- API 응답은 `docs/contracts/web-api.yaml`과 맞춘다(백엔드 `ContractTest`가 검사). 계약을 바꿔야 하면 구현하지 말고 먼저 알린다. 프론트 타입은 `npm run gen:api`로 만들고, 백엔드 없이 화면을 만들 때는 `npm run mock:api` + `npm run dev:mock`.
- 정책에 없는 결정은 PR의 "새로 내린 결정" 칸에 적는다. 다른 파트(앱·프론트·백엔드)에 영향을 주면 `docs/decisions/`에 기록한다.
- 제품 공통 규칙:
  - **금액·수익률·이자 계산은 서버가 한다**(ADR-3). 원 단위 정수, 나눗셈은 내림.
  - 화면에 없는 기능을 암시하지 않는다. "계좌 연결", "투자 권유", "추천" 같은 말을 쓰지 않고, 과거 계산에는 고지 문구를 붙인다(01 §7).
  - 예시 데이터에는 `isSample`로 "예시" 표시를 붙인다.
  - 색·모서리·간격은 `src/styles/tokens.css` 토큰만 쓴다. 강조 색은 브랜드 블루 하나이고, 상승은 빨강 ▲, 하락은 파랑 ▼이다. 테마는 기본 라이트이고, 다크는 사용자가 고를 때만이다.
  - 웹이 처리하는 개인정보(저장 항목·브라우저 저장·로그·외부 전송·보관 기간)를 바꾸면, 같은 PR에서 `Privacy.tsx`와 `privacy-web.md`를 고친다.
  - `mobile-demo/`는 시연 전용이라 실제 API를 부르지 않는다(버전 `mobile-demo/src/demo/version.ts`).
  - **공개 저장소다.** 비밀번호·키·개인 계정 정보를 코드·문서·커밋에 넣지 않는다.

## 작업 완료 시

- `tests/policy/`를 포함한 아래 검증 명령을 돌리고 결과를 그대로 보고한다.
- PR 템플릿을 채운다: Issue(`Closes #번호`), 참고한 문서, 영향받는 파트, 새로 내린 결정, 검증 결과.
- 기준 문서·계약·정책·지침(`AGENTS.md`)을 바꾼 PR에는 `spec-change` 라벨을 붙이고 `docs/CHANGELOG.md`에 한 줄을 더한다. CI(`pr-rules`)가 검사한다.
- 브랜치는 `<종류>-<내용>`, 커밋은 `feat(web): 한국어 요약`·`fix(m): …` 형식이다. `main`에는 PR로 머지한다.

## `spec-change` PR이 병합되면

작업 브랜치를 최신 `main`에 rebase하고 CI를 확인한다. 그다음 AI 세션을 새로 시작한다. 진행 중인 세션을 이어 가야 하면 "`docs/CHANGELOG.md`의 최신 항목을 읽고, 변경된 문서를 확인해서 현재 구현과 테스트에 필요한 변경을 먼저 정리해줘"라고 요청한다.

## 검증 명령

Node `^20.19.0 || >=22.12.0`, Java 21.

```bash
npm ci && npm --prefix mobile-demo ci
npm run typecheck          # 웹 tsc + 시연 tsc
npm run build              # 웹 빌드 + 시연 빌드(/m) → dist/
npm --prefix mobile-demo run lint
(cd backend && ./gradlew build)   # 웹 백엔드 빌드·테스트
```

로컬 실행은 README "로컬에서 띄우기"를 본다.

## 하지 않는 것

- Vercel 운영 배포를 직접 실행하지 않는다(`main` 머지 → 자동 배포).
- 앱 서버(flexable-app `backend/`)·웹 서버의 `.env`·운영 DB를 건드리지 않는다. 비밀 값은 사람이 서버 환경 변수에 넣는다.
