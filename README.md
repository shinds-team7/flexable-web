# 텅장관리 웹 (flexable-web)

앱에서 아낀 돈(시드머니)으로 지난 주식·적금을 실험해 보는 데스크톱 웹사이트와, 앱 시연 화면(`/m`)을 담은 저장소.

- 웹: Vite + React + TypeScript · React Router · TanStack Query
- 시연(`/m`): Expo 웹(예시 데이터, 서버 호출 없음)
- API 서버·계정·앱: [`shinds-team7/project2`](https://github.com/shinds-team7/project2) (계약 `docs/API.md`, 웹 계획 `docs/web/`)

## 경로

| 경로 | 화면 | 상태 |
|---|---|---|
| `/` | 랜딩(예시 차트·로그인 진입) | 완료 |
| `/login`, `/oauth/callback` | 카카오·Google·이메일 로그인(실제 API) | 완료 |
| `/home` | 시드머니 · 쌓인 모양(꺾은선) · 굴렸다면 · 코스피/코스닥 · 청년 돈 소식 | 화면 완료, 데이터는 예시(API 대기) |
| `/me` | 계정 · 테마(라이트/다크) · 로그아웃 | 기본 완료 |
| `/lab/stocks`, `/lab/savings`, `/lab/mix` | 주식 타임머신 · 적금 비교 · 섞어보기 | 자리만(팀원 개발) |
| `/news`, `/news/:id`, `/plus`, `/goal`, `/billing/result`, `/p/:id`, `/signup` | 소식 · 플러스 · 목표 · 결제 결과 · 공유 · 가입 | 자리만(팀원 개발) |
| `/m/*` | 앱 시연(온보딩·홈·지출계획·분석·마이) | 완료(project2에서 옮김) |

새 화면은 `src/App.tsx`의 `Placeholder` 자리를 바꿔 끼운다. 화면 설계는 [`docs/reference/wireframes.html`](docs/reference/wireframes.html)의 같은 이름 화면을 따른다(브라우저로 열기).

## 로컬에서 띄우기

```bash
npm ci && npm --prefix mobile-demo ci

# 웹 (http://localhost:5173). /api 요청은 로컬 백엔드(8080)로 프록시된다.
npm run dev
# 백엔드: project2/backend 에서 ./gradlew bootRun --args='--spring.profiles.active=local'

# 운영 API에 붙여 보기(이메일 로그인만 가능, CORS·OAuth 허용 목록에 localhost:5173이 없으면 소셜 로그인은 막힌다)
VITE_DEV_API_TARGET=https://flex-able-sh.duckdns.org npm run dev

# 시연 (http://localhost:8081/m)
npm run dev:m
```

소셜 로그인을 로컬에서 시험하려면 로컬 백엔드 환경변수 `OAUTH_ALLOWED_REDIRECT_URIS`에 `http://localhost:5173/oauth/callback`을 더한다.

## 빌드·배포

```bash
npm run build      # dist/ = 웹 + dist/m(시연)
```

Vercel 프로젝트 하나가 이 저장소의 `main`을 자동 배포한다(`vercel.json`: 설치·빌드 명령, `/m/*`는 시연 index로, 나머지는 웹 index로 rewrite).

배포 주소가 정해지면 API 서버(project2)에 다음을 추가해야 한다.
- 서버 `.env`의 `CORS_ORIGINS`에 웹 주소
- `OAUTH_ALLOWED_REDIRECT_URIS`에 `https://<웹 주소>/oauth/callback`
- 운영 웹 환경변수 `VITE_API_URL=https://flex-able-sh.duckdns.org`(도메인 구매 뒤 `https://api.<도메인>`)
