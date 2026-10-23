# 텅장관리 웹 (flexable-web) 

앱에서 아낀 돈(시드머니)으로 지난 주식·적금을 실험해 보는 데스크톱 웹사이트와, 앱 시연 화면(`/m`)을 담은 저장소.

- 웹: Vite + React + TypeScript · React Router · TanStack Query
- 시연(`/m`): Expo 웹(예시 데이터, 서버 호출 없음)
- 운영 두 곳(10-22 기준, 자세한 것은 [웹 인수인계](docs/product/HANDOFF.md))
  - https://solpa.shinhanacademy.co.kr: 웹 화면·웹 백엔드·DB를 한 VM에서 돌린다([`deploy/vm/README.md`](deploy/vm/README.md)). 웹 계정·웹 방침·앱 연동은 여기서만 동작한다. `main` 머지로 자동 반영되지 않고, VM에서 사람이 반영한다. 11-18 VM 종료 전에 AWS로 옮긴다
  - https://flexable-web-delta.vercel.app (시연 `/m`): `main` 머지 시 자동 배포. `VITE_API_URL`이 앱 서버를 가리켜 임시로 앱 계정으로 로그인되고, 웹 백엔드 API(시드머니 연동·시세·시뮬레이션)는 없다([경계 문서](docs/product/04-service-boundaries.md) §4)
- 앱·앱 서버: [`shinds-team7/flexable-app`](https://github.com/shinds-team7/flexable-app)(이전 이름 project2). 웹 서버는 이 저장소 `backend/`(웹 계정·소셜 로그인·앱 연동·시세·투자 시뮬레이션·사건 핀까지 구현)

## 팀 작업의 출발점

이 저장소에서 웹 제품 전체를 개발한다. 현재 배포본은 팀원이 기능을 이어서 만들 초기 UI·로그인 기반이다. 화면의 예시 데이터와 Placeholder는 미완성 상태를 뜻한다. 기능 완료에는 화면·API 계약·서버 로직·데이터 준비·통합 검증이 모두 필요하다.

1. [제품 문서](docs/product/README.md), [최신 서버 경계 결정](docs/product/04-service-boundaries.md), [웹 인수인계](docs/product/HANDOFF.md)를 읽는다.
2. 웹 화면·상태와 API 요청·응답을 정한다. 웹 API 계약은 이 저장소에, 앱 연동 API 계약만 앱 저장소 `docs/API.md`에 적는다.
3. 화면은 `src/`, 서버는 `backend/`에서 구현한다. 앱 연동에 필요한 앱 저장소 쪽 변경만 연계 PR로 올린다. 예시 응답을 실제 API로 바꾸고 실패·빈 상태도 검증한다.
4. 검사 결과와 미구현·운영 미확인 항목을 분리해 기록한다. Vercel에 UI가 배포됐다고 기능 완료로 기록하지 않는다.

## 경로

| 경로 | 화면 | 상태 |
|---|---|---|
| `/` | 랜딩(예시 차트·로그인 진입) | 완료 |
| `/login`, `/signup`, `/oauth/callback` | 카카오·Google·이메일 로그인, 이메일 가입(실제 API) | 완료 |
| `/home` | 시드머니 · 쌓인 모양(꺾은선) · 굴렸다면 · 코스피/코스닥 · 청년 금융 소식 | 시드머니·꺾은선은 앱 연동 값(웹 백엔드 배포만, 연동 전·체험은 예시). 코스피/코스닥·소식은 예시(API 대기) |
| `/me` | 계정 · 앱 연동하기 · 구독(모의) · 테마(라이트/다크) · 사용법 다시 보기 · 로그아웃 · 탈퇴 | 완료. 구독은 늘 무료로 보이고 해지 화면은 시연 |
| `/invest` | 투자 시뮬레이션(종목 목록·넣는 방식 3종·주별 평가액·사건 핀·DART 근거) · 첫 방문 안내 · 사용법 보기 | 완료(웹 백엔드 배포만. 시세는 worker 수집) |
| `/savings` | 적금 비교 · 정책 적금 · 기간 동안 내 돈 차트 | 화면 완료, 데이터는 예시(실제 공시 연동은 미머지, [HANDOFF](docs/product/HANDOFF.md) 10-23) |
| `/news` | 청년 금융 소식(필터·오늘의 한 장·챙기기) | 화면 완료, 데이터는 예시. 실제 수집·API는 #34 |
| `/news/:id`, `/mix`, `/p/:id` | 소식 상세 · 섞어보기 · 공유 | 자리만 |
| `/goal` | AI 목표 달성 | 자리만. 해커톤에서 뺌(확정 17, 발표 자료로만) |
| `/plus` | 플러스 요금표 | UI 구현. 요금제·구독 데이터는 예시 |
| `/billing/result` | 모의 결제 확인 · 완료 · 실패 · 취소 · 해지 확인 | 화면 완료. 요금제를 저장하지 않는 시연(실결제는 [billing README](backend/src/main/java/com/flexable/web/billing/README.md)) |
| `/privacy` | 웹 개인정보처리방침 | 2026-10-21 시행. 웹 백엔드 배포만 이 방침을 쓰고, Vercel은 앱 방침으로 연결 |
| `/lab/*` | 예전 주소 → 새 경로로 이동 | 호환 |
| `/m/*` | 앱 시연(온보딩·홈·지출계획·분석·마이) | 완료(project2에서 옮김) |

새 화면은 `src/App.tsx`의 `Placeholder` 자리를 바꿔 끼운다. 화면 설계는 [`docs/reference/wireframes.html`](docs/reference/wireframes.html)의 같은 이름 화면을 따른다(브라우저로 열기).

## 로그인 없이 체험하기

랜딩의 **로그인 없이 체험하기**로 `/home`에 진입한다. 비로그인 사용자도 모든 웹 메뉴와 `/me`에 직접 접근할 수 있다. 체험 중에는 예시 데이터 안내와 홈·내 정보 링크를 표시한다.

- 적금 비교는 플러스와 같은 최대 5개까지 체험할 수 있다. 기존 예시 데이터의 금액·조건 범위는 그대로다.
- 플러스 체험은 로그인 없이 모의 결제 결과 경로로 이동한다. 실제 결제나 구독 생성은 하지 않는다.
- 테마는 브라우저에 저장하고, 비로그인 상태에서는 계정 설정 API를 호출하지 않는다. 로그아웃·탈퇴는 로그인한 계정에만 표시한다.
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

새 배포 도메인을 추가할 때 운영 담당자가 API 서버(project2)와 웹 환경설정을 함께 갱신한다. 아래는 절차이며 이번 문서 수정에서 운영 설정을 변경하거나 확인한 것은 아니다.
- 서버 `.env`의 `CORS_ORIGINS`에 웹 주소
- `OAUTH_ALLOWED_REDIRECT_URIS`에 `https://<웹 주소>/oauth/callback`
- 운영 웹 환경변수 `VITE_API_URL=https://flex-able-sh.duckdns.org`(도메인 구매 뒤 `https://api.<도메인>`)
