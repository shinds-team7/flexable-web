# 웹 백엔드 (flexable-web/backend)

> **웹 계정(`config`·`common`·`auth`·`user`), 앱 연동(`applink`·`seedmoney`), 시세·투자 시뮬레이션·사건 API(`market`·`simulation`·`ingest`), 목표·AI 안내(`engagement`·`ai`), 청년 정책 수집(온통청년)·검수 없는 소식 게시와 AI 요약(Gemini)(`news`·`ingest`)까지 구현됐다(2026-10-26).** 목표·AI 계약은 [`docs/product/goal-ai.md`](../docs/product/goal-ai.md). `insight`·`savings`·`billing`은 README로 책임만 정해 둔 상태이고 코드가 없다. 2026-10-20 사용자 결정: 웹은 앱(project2)과 서버·DB·계정을 따로 운영하고, 사용자가 원할 때만 [앱 연동하기]로 앱 정보를 받아 온다. 경계와 연동 계약은 [`docs/product/04-service-boundaries.md`](../docs/product/04-service-boundaries.md)가 정본이다.

## 왜 분리하나

- 웹은 앱과 별개로 **아카데미 내부 폐쇄망**에 띄운다(사양은 주최 측이 맞춰 줌).
- 웹 부하(시세 수집·시뮬레이션)가 앱 API에 영향을 주면 안 되고, 배포도 독립적이어야 한다.
- 앱을 쓰지 않는 사람도 웹만 가입해서 쓸 수 있어야 한다.

## 전체 그림

```text
브라우저 ──▶ nginx(웹 정적 파일 + /api 프록시) ──▶ 웹 백엔드 api(이 폴더, Spring) ──▶ 웹 DB(MySQL 8.4)
                                                       ├─ applink ──▶ project2 /internal/v1/web-links (연동한 사용자만)
                                                       ├─ auth ──▶ 카카오·Google(소셜 로그인)
                                                       └─ ai ──▶ OpenAI(목표 안내, 키가 있을 때만)
웹 백엔드 worker(같은 코드, worker 프로필, HTTP 없음) ──▶ 키움·KRX·OpenDART·온통청년·Gemini(소식 요약) ──▶ 같은 웹 DB
```

VM 구성(nginx·api·worker·MySQL 컨테이너)은 [`deploy/vm/README.md`](../deploy/vm/README.md). 로컬은 H2 파일 DB(`local` 프로필), 테스트는 H2 메모리 DB를 쓴다.

- 브라우저는 **웹 백엔드만** 호출한다. project2 API를 브라우저가 직접 부르지 않는다.
- project2와 통신하는 코드는 `applink` 패키지 **한 곳에만** 둔다. 다른 패키지는 `applink`가 공개한 인터페이스·DTO만 쓴다.
- 웹 계정은 웹 DB에 따로 둔다. 앱 계정과는 연동 레코드(`linkId`)로만 이어지고, 앱 테이블을 복제하지 않는다.

## 스택

project2 `backend/`와 맞춘다: Spring Boot 4 · Java 21 · Gradle · MySQL · Flyway. 패키지 `com.flexable.web`. 기능 하나 = 패키지 하나, 안에서는 `XxxController`·`XxxService`·`XxxRepository`·엔티티를 평평하게 둔다(project2와 같은 방식).

## 패키지

| 패키지 | 책임 | 의존해도 되는 곳 |
|---|---|---|
| `config` | 보안·CORS·시계 설정 | 전부 |
| `common` | 오류 응답 형식, 금액·날짜 공통 타입 | 없음 |
| `applink` | [앱 연동하기]와 project2 호출의 유일한 출입구 | `common` |
| `auth` | 웹 가입·로그인·세션 발급·폐기(웹 계정, 자체 비밀키) | `user` |
| `user` | 웹 회원 정보·설정·동의, 탈퇴 조정 | `applink` |
| `seedmoney` | 앱에서 확정한 시드머니를 받아 웹에서 쓰는 시드머니 | `applink`, `user` |
| `market` | 종목·일별 시세·사건 | `common` |
| `practice` | 사건 퀴즈·정수 주 가상 매매·30분 메모리 세션 | `market` |
| `insight` | 사건 설명(사전 생성·검수 상태). 코드 없음 | `market` |
| `savings` | 일반 적금 상품·금리(finlife 공시 DB)·만기 계산·청년정책 목록(#53). 정책 적금 계산은 없음 | `common` |
| `simulation` | 투자 시뮬레이션 계산(섞어보기 계산·프리셋은 아직 없음, 적금 계산은 `savings`) | `market`, `savings`, `seedmoney` |
| `news` | 청년 금융 소식: 온통청년 수집 카드 자동 게시·AI 요약 저장·`GET /youth-news`(#47·#93) | `common` |
| `billing` | 요금제·구독·결제. 코드 없음(모의 결제는 화면만) | `user` |
| `engagement` | 목표·AI 안내·사용량, 공유·지표 이벤트(미구현) | `simulation`, `user`, `seedmoney`, `ai` |
| `ai` | OpenAI 목표 안내 클라이언트(식별자·자유 입력 이름 미전송) | `common` |
| `newssearch` | 사건 상세 뉴스 기사 검색(NAVER API HUB 중계·예시 소스, 저장 안 함). `market.NewsSearch` 구현 | `market` |
| `ingest` | 외부 데이터 수집 작업(worker 프로필에서만 동작) | 각 도메인의 저장 인터페이스(지금은 `market`) |

표의 오른쪽 열은 **허용**하는 방향이다. 실제 코드는 그중 일부만 쓴다(10-24 기준 `simulation → market`, `seedmoney → applink`, `user → applink`, `engagement → seedmoney·user·ai`, `ingest → market`).

규칙: 표에 없는 방향의 import는 금지하고 `src/test/.../architecture/PackageDependencyTest`로 막는다. `common`은 아무 데도 의존하지 않으므로 모든 패키지가 쓸 수 있다. 다른 패키지의 Repository·엔티티를 직접 쓰지 않고 그 패키지의 공개 서비스·DTO만 쓴다(같은 테스트가 검사). 의존 방향을 거슬러 불러야 할 때(예: 탈퇴 시 각 패키지 데이터 삭제)는 아래 패키지가 인터페이스를 두고 위 패키지가 구현한다(`user.UserWithdrawalListener`). 표를 고치면 테스트의 `ALLOWED`도 함께 고친다. 회원 패키지·테이블 이름은 앱(project2 `user`·`users`)과 같게 `user`로 둔다(2026-10-20 사용자 결정, 이전 표기 `member`).

## API

> **정본은 [`docs/contracts/web-api.yaml`](../docs/contracts/web-api.yaml)(OpenAPI)이다.** 아래 표는 읽기 쉬운 요약이고, 다르면 스펙을 따른다. `contract.ContractTest`가 실제 응답을 스펙으로 검사한다.

웹 백엔드는 자기 서버이므로 `/api/v1/...`를 그대로 쓴다(`/web` 접두어 없음). 금액·수익률 계산은 서버가 하고 원 단위 정수, 나눗셈은 내림. 오류는 `{ code, message, ... }`(project2와 같은 형식), 시각은 `+09:00` 붙은 ISO-8601.

| 메서드·경로 | 인증 | 내용 |
|---|---|---|
| `POST /auth/signup` | 없음 | `{email, password, agreeTerms}` → 201 `{accessToken, expiresAt, user}`. 비밀번호 8~64자·영문+숫자, `agreeTerms`는 `true`. 개인정보는 동의가 아니라 계약 이행으로 처리하고 방침을 안내한다(예전 `agreePrivacy`는 무시, V7). 같은 웹 이메일이 있으면 409 `EMAIL_UNAVAILABLE` |
| `POST /auth/login` | 없음 | `{email, password}` → `{accessToken, expiresAt, user}`. 틀리면 401 `INVALID_CREDENTIALS`(없는 이메일과 구분하지 않음), 이메일별 10분에 5회 실패하면 429 `TOO_MANY_ATTEMPTS` + `retryAfterSeconds` |
| `POST /auth/logout` | Bearer | 204. 이 회원의 **웹** 토큰을 모든 기기에서 폐기(`tokenVersion` 증가). 앱 세션·연동은 그대로 |
| `GET /me` | Bearer | `{id, email, createdAt, provider, hasPassword}`. `provider`는 `email`·`kakao`·`google`, 소셜로 가입했고 이메일을 받지 못했으면 `email`은 `null` |
| `DELETE /me` | Bearer | 이메일 계정 `{password}`, 소셜이 붙은 계정 `{confirm: "탈퇴"}` → 204. 웹 회원·설정·로그인 수단·앱 연동 삭제. 앱 서버 연동 해제와 카카오 연결 끊기(`KAKAO_ADMIN_KEY`가 있을 때)는 커밋 뒤 한 번씩 요청하고, 실패해도 탈퇴는 끝난다(탈퇴가 롤백되면 요청하지 않음) |
| `GET /auth/oauth/providers` | 없음 | `{providers: ["kakao", "google"]}` — client-id가 설정된 공급자만 |
| `GET /auth/oauth/{provider}/start` | 없음 | `?redirectUri=&codeChallenge=`(PKCE S256) → 공급자 로그인으로 302. `redirectUri`는 `OAUTH_ALLOWED_REDIRECT_URIS`와 정확히 같아야 한다 |
| `GET /auth/oauth/{provider}/callback` | 없음 | 공급자가 부른다 → `redirectUri?code=`(2분, 한 번) 또는 `?error=cancelled\|provider_unavailable\|email_in_use\|failed` |
| `POST /auth/oauth/exchange` | 없음 | `{code, codeVerifier}` → `{accessToken, expiresAt, user}`. 틀리거나 만료되면 401 `OAUTH_CODE_INVALID` |
| `GET /me/settings` | Bearer | `{theme: "light"\|"dark", seenTours: [], disclaimerAckAt: null}` |
| `PATCH /me/settings` | Bearer | 보낸 필드만 바꾼다. `theme`, `seenTours`(이미 본 목록에 병합, 키 `[a-z0-9-]` 40자·최대 24개), `disclaimerAck: true`(서버 시각으로 기록) |
| `GET /me/goal` | Bearer | `{goal: Goal 또는 null, ai:{available,plan:"FREE",limitPerDay,remainingToday}}`. 진행·시나리오·점검표는 서버 계산, 저장한 코치는 현재 facts와 다르면 `stale=true`. 앱 시드머니 available이면 앱 값, 아니면 직접 입력 값 |
| `PUT /me/goal` | Bearer | `{category,name,amount,dueMonth,currentAmount?,monthlyPace?}` → GET과 같은 응답. 회원당 하나 생성·수정, version 증가. 종류 6개·이름 1~20자·금액 1만~10억원·기한 다음 달~120개월, 입력 오류 400 `VALIDATION_FAILED`+`fields`. 이름만 변경하면 코치 stale은 그대로 |
| `DELETE /me/goal` | Bearer | 204, 없어도 204. 목표·코치 삭제, 사용 횟수 유지 |
| `POST /me/goal/coach` | Bearer | `{coach,ai}`. 같은 facts의 AI 결과는 캐시(차감 없음), 키 없음·전체 상한·호출/검사 실패는 기본 안내. 무료 일일 3회 초과 429 `TOO_MANY_ATTEMPTS`+`retryAfterSeconds`+`plan:"FREE"`+`limitPerDay`, 호출 중 목표 변경·삭제·탈퇴는 409 `GOAL_CHANGED`, 목표 없음 404 `NOT_FOUND` |
| `GET /market/instruments?board=KOSPI\|KOSDAQ\|ETF` | 없음 | 시가총액 상위 종목(기본 100) `{board, items:[{id,name,market,kind,board,rank,marketCap}], source, note, dataAsOf}`. worker가 아직 모으지 않았으면 `items: []` |
| `GET /market/events/{id}` | 없음 | 사건 상세 `{id, code, name, scope, startDate, endDate, windowDays, direction, headline, marketReaction:{returnRate, marketReturn, volumeRatio, weekReturn}, afterwards:{d30, d365}, sources:[{type, externalId, title, publisher, date, url, weight}], newsSearchUrl, whatHappened, whyItMoved, aiGenerated, aiSummary:{text, model, generatedAt, isSample}|null, confidence, noticeKey=EVENT_EXPLAIN, notice}`(03 C-10). 수익률은 비율, 30·365일 뒤가 아직 안 왔으면 `null`. 설명(LLM) 전이라 `whatHappened`는 수치로 만든 사실 문장(기간·등락률·같은 기간 시장·공시 수, 원인 단정 없음)이고 `aiGenerated=false`, `confidence`는 근거가 없으면 `LOW`. `aiSummary`는 worker가 미리 저장한 AI 개요이고(요청 중 AI 호출 없음) 없거나 숨겼으면 `null`. 없으면 404 `NOT_FOUND` |
| `GET /market/status` | 없음 | `{pricesAsOf, instrumentsAsOf, instruments, empty}` |
| `GET /market/instruments/{id}/prices?period=3M\|6M\|1Y\|3Y` | 없음 | 화면 차트용 일별 종가(수정주가)만 `{id, name, kind, period, startDate, endDate, dataAsOf, basis=DAILY_ADJ_CLOSE, points:[{date, close}], sources, noticeKey=PRICE_PAST, notice, isSample}`. 기간은 마지막 거래일에서 개월 수(3·6·12·36)만큼 거슬러 간 날 이후 첫 거래일부터. 시가·고가·저가·거래량은 주지 않는다([결정](../docs/decisions/2026-10-26-invest-insight-redesign.md) ④). 상위 목록 밖이거나 시세가 없으면 404, 기간이 틀리면 400 |
| `GET /market/events/{id}/news` | 없음 | 사건 무렵 뉴스 기사 `{eventId, from, to, status, items:[{title, url, publisher, publishedAt}], sourceName, notice, isSample}`. 요청 중 NAVER API HUB 뉴스 검색을 중계하고 저장·캐시하지 않는다(`no-store`). 검색어에 사건 날짜를 넣어 최대 4번 부르고, 발행일이 사건 시작 3일 전~마지막 날 3일 뒤인 기사만 최대 5건. 키 없음·실패·하루 상한이면 `status=UNAVAILABLE`. 없는 사건은 404([결정](../docs/decisions/2026-10-28-event-news.md)) |
| `GET /market/instruments/{id}/events?period=…` | 없음 | 같은 기간에 시작한 그 종목 사건 + 시장 사건 `{id, period, startDate, endDate, items:[{id, code, scope, …, headline, sourceCount, topSource, score}], noticeKey=EVENT_EXPLAIN}`. 금액 필드 없음. 상세는 `/market/events/{id}` |
| `GET /market/indices` | 없음 | 시장 띠 `{items:[{key, name, kind, unit, value, prevValue, change, changeRate, date, sourceName}], sources, isSample}`. 순서 고정(코스피·코스닥·나스닥100·S&P500·다우존스·니케이225·금·원/달러·원/엔), 마지막 값과 전일 값이 모두 있는 칸만. `changeRate`는 소수 4자리 내림(음수는 더 작은 쪽). 지금은 코스피·코스닥만 수집(나머지는 #94) |
| `GET /market/industries?board=KOSPI\|KOSDAQ&limit=1~10` | 없음 | 업종별 시가총액 상위 종목 `{board, items:[{categoryCode, categoryName, totalMarketCap, instruments:[{id, name, rank, marketCap}]}], classificationVersion=KIWOOM_UPNAME_V1, classificationAsOf, sources, note, isSample}`. 상위 목록 안에서만 묶고 업종 빈 값은 뺀다. 업종은 시가총액 합 순, 업종 안은 순위 순. ETF·범위 밖 `limit`은 400 |
| `POST /simulations/run` | 없음 | `{startDate:"YYYY-MM-01", funding:{mode:LUMP_SUM\|SPLIT\|PACE, totalAmount?, monthlyAmount?}, legs:[{instrumentId, weight?}]}`(03 §8-2의 부분집합). 응답: 요약·주별 `series[{weekStart,date,tradingDays,total,invested,contributed,profit,returnRate,legs[…]}]`·`assumptions`·`noticeKey=SIM_PAST`·`sources`. 상위 목록 밖 종목·금액 범위·종목 1~3개·비율 합 1은 400, 시세를 아직 모으지 않은 종목은 503 `MARKET_UNAVAILABLE`(+`field`=종목 코드). `events[]`: 기간 안에 시작한 고른 종목의 사건 + 시장 사건 `{id, code(시장 사건은 null), scope, startDate, endDate, windowDays, direction, returnRate, marketReturn, headline, hasExplanation, sourceName, sourceCount, topSource, score, valueBefore, valueAfter, contributionInWindow, valueChange, noticeKey}`. 이때 내 돈(03 C-9)은 종목 사건이면 그 종목, 시장 사건이면 전체 평가액으로 사건 시작 전날·마지막 날 종가 기준이고, `valueChange = after − before − 그 사이 넣은 돈`, 아직 넣기 전이면 금액 필드가 `null`. 핀 8개 선택·묶음은 화면이 한다 |
| `GET /app-link` | Bearer | 연동 상태 `AppLink`(아래). 저장한 마지막 값만 읽는다(앱 서버를 부르지 않고 DB에 쓰지 않음). 마지막 확인에서 1분이 지났으면 `sync.due: true`이고, 화면이 `POST /app-link/refresh`로 다시 받는다 |
| `POST /app-link/refresh` | Bearer | 200 `AppLink`. `sync.due`이면 앱 서버에서 회원 정보·시드머니를 다시 받아 저장하고, 아니거나 같은 회원의 연동·해제·다시 받기가 처리 중이면 저장한 값을 그대로 준다. 앱 서버 장애면 저장한 마지막 값과 `sync.status: "stale"`. 앱에서 해제·앱 탈퇴(`LINK_NOT_FOUND`)면 웹 연동을 지우고 `{linked: false, reason: "app_unlinked"}`. 연동이 없으면 `{linked: false}` |
| `POST /app-link` | Bearer | `{code}`(앱에서 받은 6자리, `K7M2Q9`처럼 소문자 가능) → 201 `AppLink`. 오류: 400 `LINK_CODE_INVALID`(없음·만료·사용됨), 409 `APP_LINK_EXISTS`(이미 연동, 교체하지 않음), 409 `APP_LINK_IN_PROGRESS`(같은 회원의 요청 처리 중), 429 `TOO_MANY_ATTEMPTS`+`retryAfterSeconds`(코드 실패 회원당 10분 5회 또는 앱 서버 전체 제한), 502 `APP_LINK_RESULT_UNKNOWN`(보낸 뒤 응답 없음 — 다시 보내지 않음, 앱의 연동 목록 확인 후 새 코드), 503 `APP_UNAVAILABLE`(연결 실패·서비스 키 설정 오류) |
| `GET /me/seed-money` | Bearer | 웹 시드머니 `{source: "app"\|"none", status, total, base, monthlyGoal, startedOn, updatedAt, entries, sync, manual}`. 앱 연동 값(`GET /app-link`처럼 저장한 값만 읽고, `sync.due`이면 화면이 `POST /app-link/refresh` 뒤 다시 읽는다)이고 연동이 없으면 `source: "none"`에 앱 값 필드는 `null`. 그래프는 (`startedOn`, `base`) 다음에 (`cycleEnd`, `totalAfter`)를 잇는다. `manual`은 웹에서 직접 고친 값 `{total, updatedAt}` 또는 `null`이고, 있으면 화면·시뮬레이션은 앱 값 대신 이 값을 쓴다(앱 값 필드는 그대로) |
| `PUT /me/seed-money/manual` | Bearer | `{total}`(원 단위 정수, 0~10억 원) → GET과 같은 응답 + `appSync`. 회원당 하나, 다시 보내면 덮어쓴다. 앱 연동 회원이면 앱 서버(`PUT /internal/v1/web-links/{linkId}/seed-money`)에 먼저 반영하고, 성공하면 직접 수정값을 지워 앱 값을 쓴다(`appSync: {status: "applied"}`), 실패하면 웹에만 저장(`appSync: {status: "failed", message}`). 연동 안 했으면 `appSync: null`(#83, 정책 §1). 범위 밖·소수·문자·빠짐은 400 `VALIDATION_FAILED`+`fields.total` |
| `DELETE /me/seed-money/manual` | Bearer | 204. 직접 고친 값을 지우고 앱 기록 기준으로 되돌린다. 없어도 204 |
| `DELETE /app-link` | Bearer | 204. 앱 서버 해제 → 웹 연동·저장한 앱 정보 삭제. 연동이 없으면 그대로 204. 앱 서버 장애면 503 `APP_UNAVAILABLE`이고 연동은 남는다(다시 시도) |
| `GET /savings/products` | 없음 | `?monthly=&termMonths=&sort=BASE_RATE\|MAX_RATE\|TERM&direction=&reserveType=FIXED\|FREE&sectors=BANK,SAVINGS_BANK&companies=은행이름,…&page=&size=` → `{items[], total, page, size, minInterestAfterTax, maxInterestAfterTax, noRateCount, disclosureMonth, dataAsOf, notice, isSample: false}`. 로컬 DB(finlife 공시 복사본)에서 읽고 `items[].result`(기본금리 기준 만기 계산)는 서버가 계산한다. 월 한도를 넘는 돈은 `excludedAmount` |
| `GET /savings/companies` | 없음 | 공시가 있는 금융회사 `[{name, sector}]`(가나다순). 화면의 은행 선택지 |
| `GET /savings/policies` | 없음 | `?ids=정책번호,…` → 청년정책(적금·저축·통장 계열, 온통청년) `[{id, name, summary, support, agency, applyPeriod, minAge, maxAge, applyMethod, documents, applyUrl, …}]`. 금리가 없어 계산하지 않는다 |
| `GET /savings/products/{id}` | 없음 | `?termMonths=&reserveType=` → 상품 상세(우대조건 원문 `specialConditionText` 포함) |
| `POST /savings/simulate` | 없음 | `{productId, monthly, termMonths, reserveType, rateBasis: BASE\|MAX}` → 만기 계산 + `assumptions` |
| `GET /youth-news?age=&region=&category=` | 없음 | 청년 금융 소식 `{items:[{id, category, categories, title, summary, benefit, audience:{summary, ageMin, ageMax, incomeLimit}, regions, applyStart, applyDeadline, alwaysOpen, action, source:{org, url, asOf}, postedAt, keywords, calcLink:{to, label}\|null, correctedAt, slot}]}`. 정본은 [`web-api.yaml`](../docs/contracts/web-api.yaml). 수집한 소식을 **사람 검수 없이** 내보내고 반려(`REJECTED`)한 것과 출처·지역이 빠진 것만 뺀다([결정](../docs/decisions/2026-10-26-youth-news-auto-publish.md)). `summary`는 worker가 만든 AI 요약(없으면 `null`), `benefit`·`action`은 지금 `null`이다. `regions`는 `"NATIONWIDE"` 또는 시도 이름 목록, 날짜는 `YYYY-MM-DD`, 원문에서 확인 못 한 값은 `null`(조건 없음이 아님). 필터는 모두 선택: `age`(만 나이, 나이 범위를 모르는 쪽은 막지 않음), `region`(시도 이름, 전국 소식 포함), `category`(`TRANSPORT`·`HOUSING`·`FINANCE`·`JOB`·`EDUCATION`·`CULTURE`·`TAX`·`ETC`(기타), 그 밖은 400, `categories` 중 하나라도 맞으면 포함). `category`는 대표 분야(배지), `categories`는 드는 분야 전부(분야가 없으면 `["ETC"]`). 신청 날짜가 없고 상시도 아닌데 원문의 사업기간(`bizPrdEndYmd`)이 끝난 소식은 마감으로 보고 뺀다(마감일이 지난 소식은 화면이 목록에서 내린다). `Cache-Control: public, max-age=300` |
| `GET /health` | 없음 | `{status: "UP"}` |

투자 시뮬레이션 계산(`simulation.SimulationEngine`): 시작일은 그 달 1일로 맞추고(오늘 이후·10년 넘게 전은 400), 고른 종목 중 시작 무렵 시세가 없는 종목이 있으면 시작일을 바꾸지 않고 400으로 "○○부터 시세가 있어요"를 안내한다. 기간은 시작 월부터 고른 종목들의 마지막 시세일까지이고 시계열은 기간과 관계없이 주별이다. 한 주(월~일)의 값 = 그 주 마지막 거래일 종가로 평가(휴장 주는 직전 종가). 납입은 시작 월부터 매달 그 달 첫 거래일 종가로 산다. 한 번에(`LUMP_SUM`) = 첫 달에 `totalAmount`, 매달 나눠서(`SPLIT`)·지금 저축 속도로(`PACE`) = 매달 `monthlyAmount`. 원 단위 정수·내림, 종목 배분 나머지는 첫 종목, 수량은 소수 8자리 내림(소수점 매수 가정). 배당·세금·수수료 미반영.

`AppLink` = `{enabled, linked, reason, linkedAt, account: {email|null, provider}, seedMoney: {status, total, base, monthlyGoal, lastEntry: {cycleEnd, choice, amount, createdAt}|null, updatedAt, startedOn, entries: [{cycleEnd, choice, amount, totalAfter, createdAt}]}, sync: {status: "fresh"|"stale", syncedAt, due}}`. `due`는 마지막 확인(성공·실패)에서 `refresh-interval`(1분)이 지나 다시 받을 때가 됐는지다. `enabled`는 웹 서버에 앱 서버 주소·서비스 키가 설정됐는지이고, `false`면 화면이 [앱 연동하기]를 숨긴다. 미연동이면 `enabled`·`linked`·`reason` 말고는 `null`. `seedMoney.status`는 `available`(금액 있음)·`budget_not_set`(앱 예산 설정 전, 연동은 유지)·`not_received`(아직 한 번도 받지 못함)이고 금액은 `available`일 때만 있다. 금액은 앱 서버 값 그대로다(웹에서 계산하지 않음). `linkId`는 응답·로그에 넣지 않는다.

소셜 로그인 규칙은 project2와 같다. 공급자가 **확인한** 이메일이 같은 웹 계정이 있으면 그 계정에 로그인 수단을 붙이고 기존 웹 세션을 끊는다. 그 뒤로는 비밀번호 로그인이 401 `SOCIAL_ACCOUNT`(+`provider`)로 안내된다. 같은 공급자의 다른 계정은 붙이지 않는다(`email_in_use`). 확인되지 않은 이메일은 저장하지도 연결에 쓰지도 않는다. **앱 계정은 보지 않는다**(04 §4).

토큰: HS256, 30일, 클레임 `sub`(웹 회원 id)·`tv`(토큰 버전)·`iss=flexable-web`. 서명 키는 웹 전용(`WEB_JWT_SECRET`)이고 `iss`도 검사하므로 앱 토큰은 통과하지 못한다. 요청마다 `user_credentials.token_version`과 `tv`를 비교해 로그아웃·탈퇴된 토큰을 거절한다.

앱 연동 일일 확인: api(`!worker`)의 `applink.AppLinkRecheckJob`이 매일 03:20(Asia/Seoul)에 모든 연동을 앱 서버에 다시 조회해, 앱에서 해제·앱 탈퇴한 연동을 지운다(`app.applink.recheck-cron`). 앱 서버 설정이 없으면 건너뛴다.

목표 안내 사용량 보관: api(`!worker`)의 `engagement.GoalCoachUsageCleanupJob`이 매일 03:40(Asia/Seoul)에 `goal_coach_usage`의 `usage_date <= 오늘 − 7일` 행을 삭제한다(방침 제4조). 키가 없어도 정리하고 회원 정보 없는 `ai_daily_usage`는 남긴다. `app.goal.coach.cleanup-cron`으로 시각을 바꿀 수 있다.

## 로컬 실행

```bash
cd backend
./gradlew test                                              # 테스트(H2 메모리 DB, 실행마다 임의 서명 키)
./gradlew bootRun --args='--spring.profiles.active=local'   # MySQL 없이 H2 파일 DB(build/localdb/)로 실행
curl http://localhost:8080/api/v1/health                    # {"status":"UP"}

# 시세 수집(worker, HTTP 없음). 같은 H2 파일 DB를 api와 함께 쓴다. 키는 backend/.env(양식 .env.example)
./gradlew bootRun --args='--spring.profiles.active=local,worker'
```

시세 수집(`ingest.MarketSyncJob`, 데이터 수집 외부 호출은 worker만 한다 04 §8. api가 요청 중에 부르는 소셜 로그인·앱 연동·OpenAI는 예외): 켜질 때 한 번(`MARKET_SYNC_ON_START`)과 평일 18:30(`MARKET_SYNC_CRON`)에 돈다. ① 시장별 종목 목록을 받아 시가총액 상위 `MARKET_TOP_LIMIT`개를 `instruments`에 바꿔 넣고 ② 그 종목들의 일봉을 `daily_prices`에 저장한다. 처음에는 `MARKET_BACKFILL_YEARS`년 전 그 달 1일보다 일주일 앞부터(화면 "5년 전"이 그 달 1일부터 계산), 이후에는 마지막 거래일 10일 전부터 다시 받아 지연 등록·정정을 반영한다(05 §3). 실행 결과는 `ingest_runs`. 처음 실행은 300종목 × 5년이라 몇 분 걸리고, 다 받기 전에는 그 종목 계산이 503이다.

청년 정책 수집(`ingest.YouthNewsSyncJob`, 03 §5-7 `youth-collect`): 켜질 때 한 번(`YOUTH_SYNC_ON_START`)과 매일 06:00(`YOUTH_SYNC_CRON`)에 돈다. 정책 목록을 받아 원문을 `youth_news_raw`에, 카드를 `youth_news`(`DRAFT`)에 넣고 검수 없이 화면에 내보낸다. 원문이 그대로면(내용 해시가 같으면) 건너뛰고, 사람이 손댄(`APPROVED`·`REJECTED`) 카드는 다시 받아도 덮어쓰지 않는다. 카드에는 원문에서 옮길 수 있는 값(제목·분야·나이·지역·신청 기간·기관·링크·키워드)만 넣는다. 온통청년 요청 주소(`/go/ythip/getPlcy`)·응답 필드 이름은 2026-10-21 실제 키로 확인했다(3,472건). 코드 값의 뜻(신청기간·소득 조건 구분, 광주·전남 통합 지역코드 `12`)은 건수로 맞춰 본 것이라 코드에 `[미확인]`·추정으로 표시했다. 원문의 담당자 이름(`…PicNm`)은 저장하지 않는다.

소식 요약(같은 실행 뒤 `youth-summary`): `ingest.gemini.GeminiNewsSummarizer`가 아직 요약하지 않았거나 원문이 바뀐 카드(마감 전, 마감 임박순)를 `GEMINI_BATCH_SIZE`건씩 묶어 Gemini `generateContent`(JSON 응답)로 1~3문장 요약한다. 한 번 실행에 `GEMINI_MAX_CALLS`번까지 부르고 호출 사이 `GEMINI_CALL_DELAY`만큼 쉰다. 남은 카드는 다음 실행에 한다. 보내는 것은 정책명·정책설명·지원내용뿐이다. 받은 요약은 160자·3문장 이내, 금지어 없음, **요약의 숫자가 모두 원문에 있음**(단위만 바꾼 같은 금액은 허용)을 통과해야 저장하고, 아니면 `null`로 둔다(같은 원문은 다시 부르지 않음). 키가 없거나 호출이 실패해도 수집·게시는 그대로다. 키는 헤더로 보내고 오류 메시지에서 가린다.

| 소스 | 구현(`ingest`) | 비고 |
|---|---|---|
| 일봉 | `kiwoom.KiwoomPriceSource`(ka10081 주식일봉, 수정주가, `next-key` 연속조회) | `MARKET_PRICE_SOURCE=kiwoom\|fake` |
| 사건 근거 공시 | `dart.DartDisclosureSource`(OpenDART `corpCode.xml`·`list.json`, 원문 링크 `dart.fss.or.kr`), 가짜 `fake.FakeDisclosureSource` | `MARKET_DISCLOSURE_SOURCE=dart\|fake\|none`. `DART_API_KEY`가 비어 있으면 공시 단계를 건너뛴다(탐지는 한다) |
| 청년 정책(소식) | `youthcenter.YouthCenterPolicySource`(온통청년 오픈API, 페이지 넘김), 가짜 `fake.FakeYouthPolicySource` | `YOUTH_POLICY_SOURCE=youthcenter\|fake`. `YOUTHCENTER_API_KEY`가 비어 있으면 건너뛰고 `ingest_runs`에 "키 없음"을 남긴다 |
| 종목 목록 | `krx.KrxInstrumentSource`(코스피·코스닥·ETF 일별매매정보 `MKTCAP`), 대체 `kiwoom.KiwoomInstrumentSource`(ka10099, 상장주식수 × 종가 어림) | `MARKET_INSTRUMENT_SOURCE`, 시장별로 실패하면 `MARKET_INSTRUMENT_FALLBACK`(예: KRX ETF API 미승인 401) |
| 시장 띠(코스피·코스닥) | `kiwoom.KiwoomIndexSource`(ka20006 업종일봉, `inds_cd` 001·101, 지수×100 정수 → 소수 2자리), 가짜 `fake.FakeIndexSource` | `MARKET_PRICE_SOURCE`를 따른다. 해외 지수·환율·금은 #94 |

사건 탐지·공시 근거(`ingest.MarketEventJob`, 03 §5-3·5-4): 시세 수집이 끝나면 이어서 돈다. ① 시장 대용 종목(`MARKET_INDEX_PROXY`, 기본 KODEX 200)과 상위 목록 종목마다 저장된 전체 일봉으로 사건을 다시 찾아 `market_events`에 바꿔 넣는다(`market.EventDetector`, 03 C-8 v1). 종목 사건은 시장 영향을 뺀 초과수익률 z ≥ 3이고 하루 ±4%(ETF 3%) 이상, 또는 ±15% 이상이다. 하루 사건이 없으면 5영업일 누적 z ≥ 3.5인데, 가장 큰 하루를 빼고도 나머지 4일 누적 z ≥ 3.5여야 한다(하루에 몰린 움직임이 며칠짜리 사건으로 번지지 않게). 시장 사건(`scope=MARKET`)은 대용 종목이 하루 ±3% 이상인 날이고 대용 종목에 붙는다. 3영업일 안 사건은 합치되 한 사건은 5거래일을 넘지 않고, 종목 사건은 연도별 점수 상위 6건만 남긴다. 다시 탐지하면 같은 시작일이거나 기간이 겹치는 사건을 갱신해 id·근거를 지킨다. ② 공시 소스가 켜져 있으면 고유번호가 없는 종목만 `corpCode.xml`로 채운다. 이어 근거를 아직 찾지 않았거나 마지막 날 + 3일 전에 찾은 종목 사건마다 사건 시작 5거래일 전부터 마지막 날까지 `list.json`을 조회한다. 보고서 이름 키워드 점수(`ingest.DisclosureKeywords`: 잠정실적·공급계약·증자·합병·최대주주 변경 3점, 자기주식·배당·중대재해 2점, 대량보유·주주총회 1점 등) 순으로 사건당 5건까지 `event_sources`에 둔다. 거의 매일 나오는 임원 지분 보고는 근거로 쓰지 않는다. 시장 전체 사건은 회사 공시와 연결하지 않는다. 한 번에 `DART_MAX_CALLS`건까지 처리하고 나머지는 다음 실행에서 이어 한다. 키 문제·한도 초과(010·011·012·020·901)면 공시 단계만 멈춘다. `list.json`에는 접수 시각이 없어 "장 마감 뒤 공시는 다음 영업일 사건"을 가리지 못한다. 실행 결과는 `ingest_runs`(job=`market-events`)에 남는다.

사건 AI 개요(같은 실행 뒤 `event-overview`, [결정](../docs/decisions/2026-10-29-event-ai-summary.md)): `ingest.EventOverviewJob`이 아직 개요가 없거나 입력 지문(작성 규칙 버전 + 입력 값 SHA-256)이 바뀐 사건(종목·시장 사건, 마지막 날이 최근인 것부터)을 `EVENT_OVERVIEW_BATCH_SIZE`건씩 묶어 `ingest.gemini.GeminiEventOverviewWriter`로 1~3문장 개요를 만든다. AI는 주가 움직임 문장(1~2문장)만 쓰고, 공시 문장("이 기간에 {제목} 공시가 있었어요." 등)은 서버가 입력 공시 제목으로 붙인다. 한 번 실행에 `EVENT_OVERVIEW_MAX_CALLS`번까지, 호출 사이 `GEMINI_CALL_DELAY`만큼 쉰다. 공시 소스가 켜져 있으면 고유번호가 있는 종목 사건은 근거를 한 번 찾은 뒤에 만든다. 보내는 것은 이름·기간·거래일 수·방향·등락률·시장 대비·거래량 배수·DART 공시 제목뿐이다(네이버 기사 없음). 받은 AI 문장은 2문장 이내, 원인 단정·권유·전망 금지 표현과 공시·발표·실적·계약 같은 사실 주장 낱말 없음(종목명 안 글자 제외), **숫자가 칸마다·부호까지 입력과 같음**(등락률·시장 대비·거래량 배수·거래일 수·기간 날짜를 따로 맞추고, 오름·내림 낱말이 부호와 맞는지도 본다)을 통과하고 공시 문장을 붙인 뒤 160자·3문장 이내여야 `market_events.ai_summary`에 저장하고, 아니면 문장 없이 지문만 남긴다(같은 입력은 다시 부르지 않음). 사람 검수 없이 공개되고, 운영자가 `market_events.ai_summary_hidden`을 TRUE로 바꾸면 내려가고 다시 만들지 않는다. 키가 없거나(`EVENT_OVERVIEW_SOURCE=none` 포함) 호출이 실패해도 사건·근거는 그대로이고 상세는 `aiSummary: null`이다. `EVENT_OVERVIEW_SOURCE=fake`는 키 없이 예시 문장(`isSample`)을 쓴다. 로그에는 건수만 남긴다.

시장 띠·업종(`ingest.IndexSyncJob`·`PracticeSyncJob`): 시장 띠는 몇 칸뿐이라 시세 수집보다 먼저 돌아(처음 띄운 worker도 일봉 백필을 기다리지 않음), 업종은 사건 탐지 뒤에 돈다. 시장 띠는 칸마다 처음 30일, 이후 마지막 거래일 10일 전부터 다시 받아 `market_index_daily`에 넣고(job=`index-sync`), 실패한 칸은 마지막 성공 값을 둔다. 업종은 키움 종목정보 리스트(ka10099)의 `upName`을 `instruments.industry_name`에 저장한다(빈 값은 저장하지 않고 마지막 값을 둔다).

새 소스는 `ingest.PriceSource`/`InstrumentSource`/`DisclosureSource`/`IndexSource`를 구현하고 `ingest.IngestConfig`의 `switch`에 이름을 추가한 뒤 환경 변수를 바꾼다. `market`·`simulation`·화면은 바꾸지 않는다. 키움 HTTP 클라이언트는 JDK `HttpClient`를 쓴다(`HttpURLConnection`은 연속조회 두 번째 요청에서 Read timed out).

`local` 프로필은 `WEB_JWT_SECRET`이 없으면 실행할 때마다 임의 키를 만든다(재시작하면 다시 로그인). 앱 연동은 `APP_LINK_MODE=snapshot`(앱 서버 없이 고정 데이터, 앱 코드 규칙에 맞는 아무 6자리, 예: `K7M2Q9`)이 기본이다. 재시작하면 연동을 읽을 수 없으므로 [해제] 후 다시 연동한다. 웹 화면(`npm run dev`)의 `/api` 프록시는 기본 `http://localhost:8080`을 본다. worker 실행은 `--spring.profiles.active=worker`(HTTP 없음).

## 환경 변수

저장소는 공개라 비밀 값은 코드·문서·기본값에 넣지 않는다. 운영 VM의 환경변수(또는 커밋하지 않는 `.env`)로만 넣는다.

| 변수 | 내용 | 기본값 |
|---|---|---|
| `WEB_JWT_SECRET` | 웹 토큰 서명 키(HS256, 32바이트 이상). **앱의 `JWT_SECRET`과 다른 값.** 바꾸면 모든 웹 사용자가 로그아웃된다 | 없음(없으면 시작 실패) |
| `DB_URL` | MySQL JDBC 주소 | `jdbc:mysql://localhost:3306/flexable_web?serverTimezone=UTC&characterEncoding=UTF-8` |
| `DB_USERNAME` | MySQL 계정 | `flexable_web` |
| `DB_PASSWORD` | MySQL 비밀번호 | 없음(없으면 시작 실패) |
| `DB_POOL_SIZE` | 연결 풀 상한(api·worker가 VM 하나를 나눠 쓴다) | `10` |
| `OAUTH_CALLBACK_BASE_URL` | 공급자 콘솔에 등록할 웹 백엔드 주소. 콜백은 `{값}/api/v1/auth/oauth/{kakao\|google}/callback` | `http://localhost:8080` |
| `OAUTH_ALLOWED_REDIRECT_URIS` | 로그인 뒤 돌아갈 웹 화면 주소(쉼표 구분, 정확히 일치) | `http://localhost:5173/oauth/callback` |
| `KAKAO_CLIENT_ID`, `GOOGLE_CLIENT_ID` | 비어 있으면 그 공급자를 끈다 | 없음 |
| `KAKAO_CLIENT_SECRET`, `GOOGLE_CLIENT_SECRET`, `KAKAO_ADMIN_KEY`, `KAKAO_SCOPE` | 공급자 비밀 값(admin key는 탈퇴 시 카카오 연결 끊기용) | 없음 |
| `CORS_ORIGINS` | 다른 출처에서 부를 때만(쉼표 구분). 운영은 프록시로 같은 출처 | `http://localhost:5173` |
| `PORT` | 서버 포트 | `8080` |
| `OPENAI_API_KEY` | 목표 안내(api의 요청 중 외부 호출). 없으면 기본 안내로 동작 | 없음 |
| `OPENAI_MODEL` | strict JSON schema를 지원하는 목표 안내 모델 | `gpt-4o-mini` |
| `OPENAI_BASE_URL` | Chat Completions 경로 앞 주소 | `https://api.openai.com/v1` |
| `GOAL_COACH_FREE_DAILY_LIMIT` | 회원당 Asia/Seoul 하루 AI 호출 횟수. 모의 결제로 한도를 바꾸지 않는다 | `3` |
| `NEWS_SEARCH_SOURCE`, `NAVER_API_HUB_KEY_ID`, `NAVER_API_HUB_KEY` | 사건 상세 뉴스 기사(api의 요청 중 외부 호출, 저장·캐시 안 함). `naver`·`fake`(예시 기사), NAVER API HUB 뉴스 검색 Client ID·Secret. 키가 비어 있으면 뉴스 칸만 `UNAVAILABLE` | `naver`, 없음, 없음 |
| `NAVER_API_HUB_BASE_URL`, `NAVER_NEWS_DAILY_CAP` | NAVER API HUB 주소, 서버 하루(KST) 호출 상한(하루 한도 25,000회보다 낮게) | `https://naverapihub.apigw.ntruss.com`, `20000` |
| `GOAL_COACH_DAILY_CAP` | 회원 정보 없는 DB 날짜별 전체 상한(탈퇴해도 유지) | `300` |
| `MARKET_TOP_LIMIT` | 시장마다 시가총액 상위 몇 종목을 보여 주고 계산·수집할지 | `100` |
| `MARKET_PRICE_SOURCE`, `MARKET_INSTRUMENT_SOURCE`, `MARKET_INSTRUMENT_FALLBACK` | worker 수집 소스(위 표) | `kiwoom`, `krx`, `kiwoom` |
| `MARKET_BACKFILL_YEARS`, `MARKET_SYNC_ON_START`, `MARKET_SYNC_CRON` | 처음 받을 기간, 켜질 때 한 번 돌지, 정기 실행 시각(Asia/Seoul) | `5`, `true`, `0 30 18 * * MON-FRI` |
| `KIWOOM_BASE_URL`, `KIWOOM_APP_KEY`, `KIWOOM_SECRET_KEY` | 키움 REST API(모의투자는 `https://mockapi.kiwoom.com`) | `https://api.kiwoom.com`, 없음 |
| `KRX_BASE_URL`, `KRX_AUTH_KEY` | KRX 정보데이터시스템 Open API(API마다 이용 신청) | `https://data-dbg.krx.co.kr/svc/apis`, 없음 |
| `MARKET_INDEX_PROXY` | 사건 탐지에서 시장 전체로 보는 종목 코드(코스피200 추종 ETF) | `069500` |
| `YOUTH_POLICY_SOURCE`, `YOUTHCENTER_BASE_URL`, `YOUTHCENTER_API_KEY` | 청년 정책 수집 소스(`youthcenter`·`fake`), 온통청년 주소·오픈API 인증키(youthcenter.go.kr에서 발급) | `youthcenter`, `https://www.youthcenter.go.kr`, 없음 |
| `YOUTH_SYNC_ON_START`, `YOUTH_SYNC_CRON` | 켜질 때 한 번 돌지, 정기 실행 시각(Asia/Seoul) | `true`, `0 0 6 * * *` |
| `GEMINI_API_KEY`, `GEMINI_MODEL` | 소식 요약 Gemini API 키(aistudio.google.com에서 발급)·모델. 키가 비어 있으면 요약 없이 게시 | 없음, `gemini-flash-lite-latest` |
| `GEMINI_BATCH_SIZE`, `GEMINI_MAX_CALLS`, `GEMINI_CALL_DELAY` | 한 번 호출에 묶는 카드 수, 한 번 실행의 호출 상한, 호출 사이 쉬는 시간(무료 등급 한도에 맞춘다) | `20`, `100`, `7s` |
| `EVENT_OVERVIEW_SOURCE`, `EVENT_OVERVIEW_BATCH_SIZE`, `EVENT_OVERVIEW_MAX_CALLS` | 사건 AI 개요(worker). `gemini`(키가 없으면 건너뜀)·`fake`(키 없이 예시 문장)·`none`, 한 번 호출에 묶는 사건 수, 한 번 실행의 호출 상한. 호출 간격은 `GEMINI_CALL_DELAY` | `gemini`, `10`, `30` |
| `EVENT_OVERVIEW_GEMINI_API_KEY`, `EVENT_OVERVIEW_GEMINI_MODEL` | 사건 AI 개요 전용 Gemini 키·모델(소식 요약과 한도를 나누려면). 비어 있으면 `GEMINI_API_KEY`·`GEMINI_MODEL`을 쓴다. Gemini 무료 한도는 키가 아니라 **Google Cloud 프로젝트** 단위라 다른 프로젝트에서 만든 키여야 한도가 나뉜다 | 없음, 없음 |
| `MARKET_DISCLOSURE_SOURCE`, `DART_BASE_URL`, `DART_API_KEY`, `DART_MAX_CALLS` | 사건 근거 공시 소스, OpenDART 주소·인증키, 한 번 실행에서 공시를 찾을 사건 수 상한(하루 20,000건 한도 안) | `dart`, `https://opendart.fss.or.kr`, 없음, `5000` |
| `APP_LINK_BASE_URL` | 앱 서버 주소(`/internal/v1` 앞까지). 비어 있으면 [앱 연동하기]가 503 | 없음 |
| `APP_LINK_SERVICE_KEY` | `X-Service-Key` 값. 앱 서버 `WEB_LINK_SERVICE_KEYS` 중 하나와 같아야 한다(32자 이상) | 없음 |
| `APP_LINK_ENCRYPTION_KEY` | `linkId` 암호화 키(Base64, 32바이트, 예: `openssl rand -base64 32`). `APP_LINK_BASE_URL`이 있으면 필수(없으면 시작 실패). **바꾸면 저장된 연동을 읽을 수 없다**(사용자가 해제 후 다시 연동해야 함) | 없음 |
| `APP_LINK_MODE` | `http`(앱 서버 호출) 또는 `snapshot`(고정 데이터, 시연용) | `http`(`local` 프로필은 `snapshot`) |

로컬에서는 `backend/.env`(커밋하지 않음, 양식 `.env.example`)에 넣으면 `application.yml`이 읽는다(`spring.config.import`).

## 데이터

Flyway `src/main/resources/db/migration`, 버전별 표는 [그 폴더 README](src/main/resources/db/migration/README.md). 현재 V1~V15, 테이블 22개다. 앱 DB와 외래 키는 없다.

- `V1__web_accounts.sql`: `users`(user: 이메일·동의 시각), `user_settings`(user), `user_credentials`(auth: 비밀번호 해시·토큰 버전)
- `V2__social_login.sql`: `user_identities`(auth: 소셜 로그인 수단), 소셜 가입을 위해 `users.email`·`user_credentials.password_hash`를 비울 수 있게 함
- `V3__app_links.sql`: `app_links`(applink: 웹 회원당 하나, 암호화한 `linkId`(`link_id_cipher`), 앱에서 마지막으로 받은 회원 정보·시드머니와 조회 시각)
- `V4__market.sql`: `instruments`(market: 코드 UNIQUE, 시장·시가총액 순위·출처·기준일), `daily_prices`(market: `(instrument_id, trade_date)` PK, 제공처가 준 수정주가 종가·거래량·출처·수집 시각. 수정 계수는 따로 저장하지 않음), `ingest_runs`(ingest: 수집 실행 기록)
- `V5__market_events.sql`: `instruments.corp_code`(OpenDART 고유번호), `market_events`(market: 급변동 사건, `(instrument_id, scope, start_date, detector_version)` UNIQUE, 수익률·z·점수·연도 순위·근거 확인 시각), `event_sources`(market: 사건 근거, DART 접수번호·보고서 이름·제출인·접수일·원문 링크·키워드 점수, 사건을 지우면 함께 지워짐)
- `V6__app_link_entries.sql`: `app_links.seed_started_on`(앱 시작일), `app_link_entries`(applink: 주기별 반영 기록, 조회마다 통째로 바꾸고 연동과 함께 삭제)
- `V7__privacy_notice_basis.sql`: `users.privacy_agreed_at` NULL 허용(10-21부터 개인정보는 동의가 아니라 계약 이행 근거, 이전 가입자의 동의 시각은 유지)
- `V8__goals.sql`: `goals`·`goal_coaches`·`goal_coach_usage`·`ai_daily_usage`(engagement, [goal-ai.md](../docs/product/goal-ai.md))
- `V9__seed_money_manual.sql`: `seed_money_manual`(seedmoney: 웹에서 직접 고친 시드머니, 회원당 하나, 되돌리기·탈퇴 때 삭제)
- `V10__savings.sql`: `savings_products`·`savings_rate_options`(savings: 금융감독원 finlife 적금 공시 복사본, 상품·기간별 기본/최고 금리)
- `V11__savings_policies.sql`: `savings_policies`(savings: 온통청년 청년정책 중 적금·저축·통장 계열)
- `V12__savings_policy_region.sql`: `savings_policies.region`(정책 지역, 중앙부처는 '전국')
- `V13__youth_news.sql`: `youth_news_raw`(news: 수집 원문, `(source, external_id)` UNIQUE, 내용 해시), `youth_news`(news: 소식 카드, 검수 상태 `DRAFT`·`APPROVED`·`REJECTED`, 01 §F4 카드 항목, 계산 화면 키·오늘의 한 장 슬롯)
- `V15__youth_news_summary.sql`: `youth_news.summary`(AI 요약)·`summary_hash`(요약할 때 본 원문 해시)·`summarized_at`(news)
- `V16__invest_insight.sql`: `instruments.industry_name`·`industry_as_of`(키움 ka10099 업종, KIWOOM_UPNAME_V1), `market_index_daily`(market: 시장 띠 일별 값, `(index_key, trade_date)` PK, 값·제공처·수집 시각)
- `V17__event_ai_summary.sql`: `market_events.ai_summary`(AI 개요)·`ai_summary_model`·`ai_summary_hash`(입력 지문)·`ai_summary_at`·`ai_summary_sample`(예시 작성기)·`ai_summary_hidden`(운영자 숨김)(market)

## 아직 정해지지 않은 것

경계 문서 §10을 본다.
