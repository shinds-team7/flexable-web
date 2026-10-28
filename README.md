# 텅장관리 웹 (flexable-web) 

앱에서 아낀 돈(시드머니)으로 지난 주식·적금을 실험해 보는 데스크톱 웹사이트와, 앱 시연 화면(`/m`)을 담은 저장소.

- 웹: Vite + React + TypeScript · React Router · TanStack Query
- 시연(`/m`): Expo 웹(예시 데이터, 서버 호출 없음)
- 운영 두 곳(10-22 기준, 자세한 것은 [웹 인수인계](docs/product/HANDOFF.md))
  - https://solpa.shinhanacademy.co.kr: 웹 화면·웹 백엔드·DB를 한 VM에서 돌린다([`deploy/vm/README.md`](deploy/vm/README.md)). 웹 계정·웹 방침·앱 연동은 여기서만 동작한다. `main` 머지로 자동 반영되지 않고, VM에서 사람이 반영한다. 11-18 VM 종료 전에 AWS로 옮긴다
  - https://flexable-web-delta.vercel.app (시연 `/m`): `main` 머지 시 자동 배포. `VITE_API_URL`이 앱 서버를 가리켜 임시로 앱 계정으로 로그인되고, 웹 백엔드 API(시드머니 연동·시세·시뮬레이션·목표)는 없다([경계 문서](docs/product/04-service-boundaries.md) §4)
- 앱·앱 서버: [`shinds-team7/flexable-app`](https://github.com/shinds-team7/flexable-app)(이전 이름 project2). 웹 서버는 이 저장소 `backend/`(웹 계정·소셜 로그인·앱 연동·시세·투자 시뮬레이션·사건 핀·목표와 AI 안내까지 구현. 적금·소식·결제 서버는 아직 없음)

## 팀 작업의 출발점

이 저장소에서 웹 제품 전체를 개발한다. 현재 배포본은 팀원이 기능을 이어서 만들 초기 UI·로그인 기반이다. 화면의 예시 데이터와 Placeholder는 미완성 상태를 뜻한다. 기능 완료에는 화면·API 계약·서버 로직·데이터 준비·통합 검증이 모두 필요하다.

1. [제품 문서](docs/product/README.md), [최신 서버 경계 결정](docs/product/04-service-boundaries.md), [웹 인수인계](docs/product/HANDOFF.md)를 읽는다.
2. 웹 화면·상태와 API 요청·응답을 정한다. 웹 API 계약은 이 저장소에, 앱 연동 API 계약만 앱 저장소 `docs/API.md`에 적는다.
3. 화면은 `src/`, 서버는 `backend/`에서 구현한다. 앱 연동에 필요한 앱 저장소 쪽 변경만 연계 PR로 올린다. 예시 응답을 실제 API로 바꾸고 실패·빈 상태도 검증한다.
4. 검사 결과와 미구현·운영 미확인 항목을 분리해 기록한다. Vercel에 UI가 배포됐다고 기능 완료로 기록하지 않는다.

작업은 Issue 하나 단위로 시작하고(템플릿: 목표·참고 자료·범위·완료 조건), PR에 Issue를 연결한다. 기준 문서를 바꾸면 `spec-change` 라벨과 [CHANGELOG](docs/CHANGELOG.md) 한 줄이 필요하다. 자세한 규칙은 [AGENTS.md](AGENTS.md)와 [작업 방식](docs/decisions/2026-10-25-dev-process.md).

## 폴더 구조

```text
src/                     웹사이트(Vite + React + TypeScript, React Router, TanStack Query)
  pages/                 화면 하나 = 파일 하나. 경로 목록은 src/App.tsx
  components/            상단 바·공통 틀(Layout), 아이콘
  charts/                drawTimeChart(타임머신, 사건 핀), SeedLineChart(시드머니 꺾은선)
  data/                  화면 데이터 hook. 실제 API와 예시 값(isSample=true)이 섞여 있다
  auth/                  세션(JWT, localStorage), 카카오·Google 로그인(start → /oauth/callback → exchange)
  lib/                   API 클라이언트, 표시 포맷, 테마
  styles/tokens.css      디자인 토큰(정본, 라이트·다크)
  styles/global.css      공통 클래스(부품 스타일)와 기존 이름 별칭
mobile-demo/             앱 시연(Expo 웹, 예시 데이터). 사이트의 /m 아래에 배포된다
scripts/                 빌드 보조(시연 빌드를 dist/m에 합침)
backend/                 웹 서버(Spring Boot). 패키지 책임·API는 backend/README.md, 지침은 backend/AGENTS.md
deploy/vm/               웹 VM 배포(Docker Compose: nginx·웹 백엔드·MySQL). deploy/vm/README.md
docs/product/            웹 기획·아키텍처·개발 인수인계
docs/decisions/          개발 중 내린 주요 결정(2026-10-25부터)
docs/CHANGELOG.md        기준 문서 변경 이력
docs/reference/          참고 자료(와이어프레임). 제품 코드 아님
```

## 경로

| 경로 | 화면 | 상태 |
|---|---|---|
| `/` | 랜딩(예시 차트·로그인 진입) | 완료 |
| `/login`, `/signup`, `/oauth/callback` | 카카오·Google·이메일 로그인, 이메일 가입(실제 API) | 완료 |
| `/home` | 시드머니 · 쌓인 모양(꺾은선) · 코스피/코스닥 · 청년 금융 소식 | 시드머니·꺾은선은 앱 연동 값(웹 백엔드 배포만). 로그인했지만 연동 전이면 0원, 비로그인 체험은 예시 427만 원. [수정하기]는 로그인 회원이면 서버에 저장하고(앱 값보다 우선, 상단 칩·투자 화면에도 적용) [기록 기준으로 되돌리기]로 지운다. 비로그인 체험은 저장하지 않고 이 탭에서만 바뀐다. '굴렸다면' 카드는 10-27에 뺐다(프론트 예시 수익률 계산이라 ADR-3과 어긋남). 소식은 `GET /youth-news`의 마감 임박순 3건(소식 화면과 같은 목록, 없거나 실패하면 예시). 코스피/코스닥은 예시(#89 `GET /market/indices` 대기) |
| `/me` | 계정 · 앱 연동하기 · 구독(모의) · 테마(라이트/다크) · 사용법 다시 보기 · 로그아웃 · 탈퇴 | 완료. 구독은 늘 무료로 보이고 해지 화면은 시연 |
| `/invest` | 투자 인사이트(메뉴 이름, #88. 코스피·코스닥·ETF 시가총액 상위 목록 · 최대 3종목 · 넣는 방식 3종 · 1·3·5년·직접 지정 · 주별 평가액 · 사건 핀 · DART 근거) · 첫 방문 안내 · 사용법 보기 | 완료(웹 백엔드 배포만. 시세는 worker 수집). 비로그인도 실제 서버 계산을 부르고 결과는 저장하지 않는다. 주가 화면 개편은 #89(스펙 #90) |
| `/simulation` | 투자 시뮬레이션: 업종 선택 · 투자금 · 무작위 종목 · 캔들 재생(구간당 3초) · 공시 사건 예상 · 정수 주 가상 매매 · 결과 | 구현(#88, [결정](docs/decisions/2026-10-26-investment-practice.md)·[정책 §5](docs/policies.md#5-사건-퀴즈-투자-시뮬레이션)). 로그인 없이 서버 메모리 세션 30분. 로컬은 예시 자료, 운영은 worker가 키움·DART 자료를 준비한 뒤 업종이 보인다 |
| `/savings` | 적금 비교 · 정책 적금 · 기간 동안 내 돈 차트 | 화면 완료, 결과는 프론트 고정 예시(서버 계산·실제 공시 연동은 미머지, [HANDOFF](docs/product/HANDOFF.md) 10-23) |
| `/news` | 청년 금융 소식(필터·오늘의 한 장·챙기기) | 화면 완료, 데이터는 예시. 챙기기·필터는 브라우저 `localStorage`에만 저장(서버 없음). 실제 수집·API는 #34 |
| `/news/:id`, `/mix`, `/p/:id` | 소식 상세 · 섞어보기 · 공유 | 자리만. 섞어보기는 10-23 상단 메뉴에서 뺐고 주소만 남았다(범위 검토 중) |
| `/goal` | AI 목표 달성(메뉴 이름 'AI 계획 수립') | 구현(#50, [goal-ai.md](docs/product/goal-ai.md)): 목표 1개 저장·서버 계산·OpenAI 안내 하루 3회. 로그인 필요. 기획 의도와 차이가 있어 10-26 재정리 예정([HANDOFF](docs/product/HANDOFF.md)) |
| `/plus` | 플러스 요금표 | UI 구현. 요금·한도는 프론트 고정값(`src/data/plans.ts`), 구독은 늘 무료 |
| `/billing/result` | 모의 결제 확인 · 완료 · 실패 · 취소 · 해지 확인 | 화면 완료. 요금제를 저장하지 않는 시연(실결제는 [billing README](backend/src/main/java/com/flexable/web/billing/README.md)) |
| `/privacy` | 웹 개인정보처리방침 | 2026-10-21 시행. 웹 백엔드 배포만 이 방침을 쓰고, Vercel은 앱 방침으로 연결 |
| `/lab/*` | 예전 주소 → 새 경로로 이동 | 호환 |
| `/m/*` | 앱 시연(온보딩·홈·지출계획·분석·마이) | 완료(project2에서 옮김) |

상단 메뉴는 내 투자 성향 · 투자 인사이트 · 투자 시뮬레이션 · 적금 모아보기 · AI 계획 수립 · 청년 금융 소식 · 플러스(`src/components/Layout.tsx`). 새 화면은 `src/App.tsx`의 `Placeholder` 자리를 바꿔 끼운다. 화면 설계는 [`docs/reference/wireframes.html`](docs/reference/wireframes.html)의 같은 이름 화면을 따른다(브라우저로 열기).

## 로그인 없이 체험하기

랜딩의 **로그인 없이 체험하기**로 `/home`에 진입한다. 비로그인 사용자도 모든 웹 화면과 `/me`에 직접 접근할 수 있다(화면 접근에 로그인을 요구하지 않음). 로그인이 필요한 것은 토큰이 필요한 API(내 정보·설정·앱 연동·시드머니·목표)와 그 동작이다. 체험 중에는 예시 데이터 안내와 홈·내 정보 링크를 표시한다.

- 적금 비교는 플러스와 같은 최대 5개까지 체험할 수 있다. 기존 예시 데이터의 금액·조건 범위는 그대로다.
- 플러스 체험은 로그인 없이 모의 결제 결과 경로로 이동한다. 실제 결제나 구독 생성은 하지 않는다.
- 테마는 브라우저에 저장하고, 비로그인 상태에서는 계정 설정 API를 호출하지 않는다. 로그아웃·탈퇴는 로그인한 계정에만 표시한다.
- 투자 인사이트는 비로그인도 공개 API(`/market/**`, `POST /simulations/run`)로 실제 서버 계산을 한다. 시드머니 칸에는 예시 금액이 들어가고, 결과는 저장하지 않는다. 투자 시뮬레이션(`/practice/*`)도 로그인 없이 쓰고 계정에 남지 않는다.
- 첫 방문 안내를 본 기록은 비로그인이면 브라우저(`fx.tour.*`), 로그인하면 계정 설정(`seenTours`·`disclaimerAck`)에 남는다.
- 체험 기록은 계정에 저장되지 않는다. 위 경로 표에서 "자리만"인 화면은 아직 미구현이며, 접근을 열어 둔 것이 기능 구현 완료를 뜻하지 않는다.

## 로컬에서 띄우기

```bash
npm ci && npm --prefix mobile-demo ci

# 웹 (http://localhost:5173). /api 요청은 로컬 백엔드(8080)로 프록시된다.
npm run dev
# 웹 백엔드: backend/ 에서 ./gradlew bootRun --args='--spring.profiles.active=local' (H2, 실행·환경변수는 backend/README.md)
# 소셜 로그인은 로컬 백엔드에 KAKAO_CLIENT_ID·GOOGLE_CLIENT_ID 등을 넣었을 때만 버튼이 동작한다.
# 투자 시뮬레이션(/invest) 시세: backend/.env에 키움·KRX 키를 넣고 worker를 한 번 더 띄운다(외부 호출은 worker만).
#   (cd backend && ./gradlew bootRun --args='--spring.profiles.active=local,worker')

# 시연 (http://localhost:8081/m)
npm run dev:m
```

웹 백엔드의 `OAUTH_ALLOWED_REDIRECT_URIS` 기본값이 `http://localhost:5173/oauth/callback`이라 로컬 소셜 로그인은 공급자 콘솔에 `http://localhost:8080/api/v1/auth/oauth/{kakao|google}/callback`만 등록하면 된다.

## 빌드·배포

```bash
npm run build      # dist/ = 웹 + dist/m(시연)
```

Vercel 프로젝트 하나가 이 저장소의 `main`을 자동 배포한다(`vercel.json`: 설치·빌드 명령, `/m/*`는 시연 index로, 나머지는 웹 index로 rewrite).

solpa(VM)는 `VITE_API_URL` 없이 빌드해 같은 출처 `/api/v1`(nginx → 웹 백엔드)을 부른다. Vercel 배포본은 `VITE_API_URL`로 앱 서버(project2)를 부르는 임시 구성이다. Vercel처럼 앱 서버를 부르는 배포에 새 도메인을 추가할 때 운영 담당자가 API 서버(project2)와 웹 환경설정을 함께 갱신한다. 아래는 절차이며 이번 문서 수정에서 운영 설정을 변경하거나 확인한 것은 아니다.
- 서버 `.env`의 `CORS_ORIGINS`에 웹 주소
- `OAUTH_ALLOWED_REDIRECT_URIS`에 `https://<웹 주소>/oauth/callback`
- 운영 웹 환경변수 `VITE_API_URL=https://flex-able-sh.duckdns.org`(도메인 구매 뒤 `https://api.<도메인>`)
