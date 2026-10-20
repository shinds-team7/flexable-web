# AGENTS.md

이 저장소에서 일하는 AI(Claude·Codex·Cursor·Gemini 등)와 사람이 먼저 읽는 안내.

## 무엇을 만드는가

텅장관리(Flex-able) **데스크톱 웹사이트**. 앱에서 모은 시드머니로 지난 주식·적금을 실험해 보고(투자 시뮬레이션·적금 비교·섞어보기), 목표를 세우고, 청년 금융 소식을 보는 곳이다.
이 저장소는 웹 제품 전체의 개발 거점이다. 현재 Vercel 배포본은 팀원이 기능 구현을 이어갈 초기 UI·로그인 기반이며, 예시 데이터·준비 중 화면은 현재 상태이지 개발 범위를 제한하는 규칙이 아니다. 웹 기능 담당자는 화면뿐 아니라 API 계약·서버 로직·데이터·통합 검증까지 완료한다. 웹 서버는 이 저장소 `backend/`에서 만든다(앱과 서버·DB·계정 분리). project2에는 앱 연동에 필요한 API·화면만 연계 PR로 올린다.

앱(하루 예산 관리)은 별도 저장소 [`shinds-team7/project2`](https://github.com/shinds-team7/project2)에 있고, 앱 서버·앱 계정도 그쪽 `backend/`다. 웹은 자기 계정·서버·DB를 따로 쓰고, 사용자가 [앱 연동하기]를 했을 때만 앱 정보를 받아 온다.

| 알고 싶은 것 | 어디 |
|---|---|
| 기능·화면·아키텍처·일정(정본) | [docs/product/README.md](docs/product/README.md) → 기획·디자인·아키텍처·결정·인수인계 |
| 화면 설계 샘플 | [`docs/reference/wireframes.html`](docs/reference/wireframes.html) (이 저장소의 설계 샘플 정본). 옮기는 규칙은 [`docs/reference/README.md`](docs/reference/README.md) |
| API 계약(앱·웹 공통) | [project2 docs/API.md](https://github.com/shinds-team7/project2/blob/main/docs/API.md). 웹 초안과 구현된 계약을 구분한다 |

앱·웹 서버 분리, 웹 계정, 앱 연동, 웹 API 경로, worker 규칙은 [docs/product/04-service-boundaries.md](docs/product/04-service-boundaries.md)를 따른다. 기획 문서를 현재 구현으로 오인하지 않는다.

## 구조

```text
src/                     웹사이트(Vite + React + TypeScript, React Router, TanStack Query)
  pages/                 화면 하나 = 파일 하나. 경로 목록은 src/App.tsx
  components/            상단 바·공통 틀(Layout), 아이콘
  charts/                drawTimeChart(타임머신, 사건 핀), SeedLineChart(시드머니 꺾은선)
  data/                  화면 데이터 hook. home.ts는 API 전까지 예시 값(isSample=true)
  auth/                  세션(JWT, localStorage), 카카오·Google 로그인(start → /oauth/callback → exchange)
  lib/                   API 클라이언트, 표시 포맷, 테마
  styles/global.css      디자인 토큰(:root)과 공통 클래스
mobile-demo/             앱 시연(Expo 웹, 예시 데이터). 사이트의 /m 아래에 배포된다
scripts/                 빌드 보조(시연 빌드를 dist/m에 합침)
backend/                 웹 서버(Spring Boot). 웹 계정(auth·member)까지 구현. 패키지 책임·API는 backend/README.md
deploy/closed-network/   폐쇄망 VM 반입 묶음(예정)
docs/product/            웹 기획·아키텍처·개발 인수인계 정본
docs/reference/          참고 자료(와이어프레임). 제품 코드 아님
```

## 규칙

- **금액·수익률·이자 계산은 서버가 한다.** 웹은 결과를 그리기만 한다(ADR-3). 원 단위 정수, 나눗셈은 내림. `src/data/sampleMarket.ts`는 랜딩 예시 차트 전용이다.
- 화면에 없는 기능을 암시하지 않는다. "계좌 연결", "투자 권유", "추천" 같은 말을 쓰지 않는다. 과거 계산에는 고지 문구를 붙인다(03 §8-3).
- 예시 데이터를 보여 줄 때는 `isSample`로 "예시" 표시를 붙인다. API가 붙으면 표시가 자동으로 사라진다.
- 테마는 기본 라이트다. 다크는 사용자가 내 정보에서 고를 때만(`:root[data-theme="dark"]`). 시스템 설정을 따르지 않는다.
- 색은 `global.css`의 토큰(`var(--brand)` 등)만 쓴다. 상승은 빨강(`--rise`), 하락은 파랑(`--fall`).
- 약관·개인정보처리방침·고객지원 원문은 project2 웹(`https://project2-flex-sh.vercel.app/terms` 등) 하나만 둔다. 이 저장소에 복사하지 않는다.
- `mobile-demo/`는 시연 전용이다. 실제 서비스 API를 부르지 않는다. 버전은 `mobile-demo/src/demo/version.ts`(태그 `demo-v*`).
- 브랜치 `SXXNHU/<종류>-<내용>`, 커밋 `feat(web): 한국어 요약` / `fix(m): …`, `main`에 PR로 머지.
- **저장소는 공개(PUBLIC)다.** 비밀번호·키·개인 계정 정보를 코드·문서·커밋에 넣지 않는다.

## 검증 명령

```bash
npm ci && npm --prefix mobile-demo ci
npm run typecheck          # 웹 tsc + 시연 tsc
npm run build              # 웹 빌드 + 시연 빌드(/m) → dist/
npm --prefix mobile-demo run lint
(cd backend && ./gradlew test)   # 웹 백엔드 빌드·테스트(Java 21)
```

로컬 실행은 README의 "로컬에서 띄우기"를 본다. 코드를 바꿨으면 위 검사를 돌리고 결과를 그대로 보고한다.

## 하지 않는 것

- 배포 설정 변경 없이 Vercel 운영 배포를 직접 실행하지 않는다(`main` 머지 → 자동 배포).
- 앱 서버(project2 `backend/`)·웹 서버의 `.env`·운영 DB를 건드리지 않는다.
