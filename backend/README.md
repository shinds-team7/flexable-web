# 웹 백엔드 (flexable-web/backend)

> **웹 계정(`config`·`common`·`auth`·`user`)과 앱 연동(`applink`)까지 구현됐다(2026-10-20).** 나머지 패키지는 README로 책임만 정해 둔 상태다. 웹 화면(`src/`)은 아직 project2 API에 붙어 있고, 이 서버로 옮기는 작업은 따로 한다. 2026-10-20 사용자 결정: 웹은 앱(project2)과 서버·DB·계정을 따로 운영하고, 사용자가 원할 때만 [앱 연동하기]로 앱 정보를 받아 온다. 경계와 연동 계약은 [`docs/product/04-service-boundaries.md`](../docs/product/04-service-boundaries.md)가 정본이다.

## 왜 분리하나

- 웹은 앱과 별개로 **아카데미 내부 폐쇄망**에 띄운다(사양은 주최 측이 맞춰 줌).
- 웹 부하(시세 수집·시뮬레이션)가 앱 API에 영향을 주면 안 되고, 배포도 독립적이어야 한다.
- 앱을 쓰지 않는 사람도 웹만 가입해서 쓸 수 있어야 한다.

## 전체 그림

```text
브라우저 ──▶ 웹(Vite 정적 파일) + /api ──▶ 웹 백엔드(이 폴더, Spring) ──▶ 웹 DB(MySQL)
                                                 │
                                                 └─ applink ──▶ project2 /internal/v1/web-links (연동한 사용자만)
```

- 브라우저는 **웹 백엔드만** 호출한다. project2 API를 브라우저가 직접 부르지 않는다.
- project2와 통신하는 코드는 `applink` 패키지 **한 곳에만** 둔다. 다른 패키지는 `applink`가 공개한 인터페이스·DTO만 쓴다.
- 웹 계정은 웹 DB에 따로 둔다. 앱 계정과는 연동 레코드(`linkId`)로만 이어지고, 앱 테이블을 복제하지 않는다.

## 스택

project2 `backend/`와 맞춘다: Spring Boot 4 · Java 21 · Gradle · MySQL · Flyway. 패키지 `com.flexable.web`. 기능 하나 = 패키지 하나, 안에서는 `XxxController`·`XxxService`·`XxxRepository`·엔티티를 평평하게 둔다(project2와 같은 방식).

## 패키지

| 패키지 | 책임 | 의존해도 되는 곳 |
|---|---|---|
| `config` | 보안·CORS·프로필(api/worker)·시계 설정 | 전부 |
| `common` | 오류 응답 형식, 금액·날짜 공통 타입 | 없음 |
| `applink` | [앱 연동하기]와 project2 호출의 유일한 출입구 | `common` |
| `auth` | 웹 가입·로그인·세션 발급·폐기(웹 계정, 자체 비밀키) | `user` |
| `user` | 웹 회원 정보·설정·동의, 탈퇴 조정 | `applink` |
| `seedmoney` | 앱에서 확정한 시드머니를 받아 웹에서 쓰는 시드머니 | `applink`, `user` |
| `market` | 종목·일별 시세·사건 | `common` |
| `insight` | 사건 설명(사전 생성·검수 상태) | `market` |
| `savings` | 적금 상품·금리 | `common` |
| `simulation` | 투자·적금 계산 엔진, 프리셋 | `market`, `savings`, `seedmoney` |
| `news` | 청년 금융 소식 | `common` |
| `billing` | 요금제·구독·결제 | `user` |
| `engagement` | 목표·공유·지표 이벤트 | `simulation`, `user` |
| `ingest` | 외부 데이터 수집 작업 공통(worker 프로필에서만 동작) | 각 도메인의 저장 인터페이스 |

규칙: 표에 없는 방향의 import는 금지하고 `src/test/.../architecture/PackageDependencyTest`로 막는다. `common`은 아무 데도 의존하지 않으므로 모든 패키지가 쓸 수 있다. 다른 패키지의 Repository·엔티티를 직접 쓰지 않고 그 패키지의 공개 서비스·DTO만 쓴다(같은 테스트가 검사). 의존 방향을 거슬러 불러야 할 때(예: 탈퇴 시 각 패키지 데이터 삭제)는 아래 패키지가 인터페이스를 두고 위 패키지가 구현한다(`user.UserWithdrawalListener`). 표를 고치면 테스트의 `ALLOWED`도 함께 고친다. 회원 패키지·테이블 이름은 앱(project2 `user`·`users`)과 같게 `user`로 둔다(2026-10-20 사용자 결정, 이전 표기 `member`).

## API

웹 백엔드는 자기 서버이므로 `/api/v1/...`를 그대로 쓴다(`/web` 접두어 없음). 금액·수익률 계산은 서버가 하고 원 단위 정수, 나눗셈은 내림. 오류는 `{ code, message, ... }`(project2와 같은 형식), 시각은 `+09:00` 붙은 ISO-8601.

| 메서드·경로 | 인증 | 내용 |
|---|---|---|
| `POST /auth/signup` | 없음 | `{email, password, agreeTerms, agreePrivacy}` → 201 `{accessToken, expiresAt, user}`. 비밀번호 8~64자·영문+숫자, 두 동의 모두 `true`. 같은 웹 이메일이 있으면 409 `EMAIL_UNAVAILABLE` |
| `POST /auth/login` | 없음 | `{email, password}` → `{accessToken, expiresAt, user}`. 틀리면 401 `INVALID_CREDENTIALS`(없는 이메일과 구분하지 않음), 이메일별 10분에 5회 실패하면 429 `TOO_MANY_ATTEMPTS` + `retryAfterSeconds` |
| `POST /auth/logout` | Bearer | 204. 이 회원의 **웹** 토큰을 모든 기기에서 폐기(`tokenVersion` 증가). 앱 세션·연동은 그대로 |
| `GET /me` | Bearer | `{id, email, createdAt, provider, hasPassword}`. `provider`는 `email`·`kakao`·`google`, 소셜로 가입했고 이메일을 받지 못했으면 `email`은 `null` |
| `DELETE /me` | Bearer | 이메일 계정 `{password}`, 소셜이 붙은 계정 `{confirm: "탈퇴"}` → 204. 웹 회원·설정·로그인 수단·앱 연동 삭제, 카카오는 `KAKAO_ADMIN_KEY`가 있으면 연결 끊기. 앱 서버 연동 해제는 커밋 뒤 한 번 요청하고, 실패해도 탈퇴는 끝난다 |
| `GET /auth/oauth/providers` | 없음 | `{providers: ["kakao", "google"]}` — client-id가 설정된 공급자만 |
| `GET /auth/oauth/{provider}/start` | 없음 | `?redirectUri=&codeChallenge=`(PKCE S256) → 공급자 로그인으로 302. `redirectUri`는 `OAUTH_ALLOWED_REDIRECT_URIS`와 정확히 같아야 한다 |
| `GET /auth/oauth/{provider}/callback` | 없음 | 공급자가 부른다 → `redirectUri?code=`(2분, 한 번) 또는 `?error=cancelled\|provider_unavailable\|email_in_use\|failed` |
| `POST /auth/oauth/exchange` | 없음 | `{code, codeVerifier}` → `{accessToken, expiresAt, user}`. 틀리거나 만료되면 401 `OAUTH_CODE_INVALID` |
| `GET /me/settings` | Bearer | `{theme: "light"\|"dark", seenTours: [], disclaimerAckAt: null}` |
| `PATCH /me/settings` | Bearer | 보낸 필드만 바꾼다. `theme`, `seenTours`(이미 본 목록에 병합, 키 `[a-z0-9-]` 40자·최대 24개), `disclaimerAck: true`(서버 시각으로 기록) |
| `GET /app-link` | Bearer | 연동 상태 `AppLink`(아래). 연동돼 있고 마지막 조회에서 1분이 지났으면 앱 서버에서 회원 정보·시드머니를 다시 받는다. 앱 서버 장애면 저장한 마지막 값과 `sync.state: "stale"`. 앱에서 해제·앱 탈퇴(`LINK_NOT_FOUND`)면 웹 연동을 지우고 `{linked: false, reason: "app_unlinked"}` |
| `POST /app-link` | Bearer | `{code}`(앱에서 받은 8자리, `K7M2-Q9XB`처럼 하이픈·소문자 가능) → 201 `AppLink`. 오류: 400 `LINK_CODE_INVALID`(없음·만료·사용됨), 409 `APP_LINK_EXISTS`(이미 연동, 교체하지 않음), 409 `APP_LINK_IN_PROGRESS`(같은 회원의 요청 처리 중), 429 `TOO_MANY_ATTEMPTS`+`retryAfterSeconds`(코드 실패 회원당 10분 5회 또는 앱 서버 전체 제한), 502 `APP_LINK_RESULT_UNKNOWN`(보낸 뒤 응답 없음 — 다시 보내지 않음, 앱의 연동 목록 확인 후 새 코드), 503 `APP_UNAVAILABLE`(연결 실패·서비스 키 설정 오류) |
| `DELETE /app-link` | Bearer | 204. 앱 서버 해제 → 웹 연동·저장한 앱 정보 삭제. 연동이 없으면 그대로 204. 앱 서버 장애면 503 `APP_UNAVAILABLE`이고 연동은 남는다(다시 시도) |
| `GET /health` | 없음 | `{status: "UP"}` |

`AppLink` = `{enabled, linked, reason, linkedAt, account: {email|null, provider}, seedMoney: {status, total, base, monthlyGoal, lastEntry: {cycleEnd, choice, amount, createdAt}|null, updatedAt}, sync: {status: "fresh"|"stale", syncedAt}}`. `enabled`는 웹 서버에 앱 서버 주소·서비스 키가 설정됐는지이고, `false`면 화면이 [앱 연동하기]를 숨긴다. 미연동이면 `enabled`·`linked`·`reason` 말고는 `null`. `seedMoney.status`는 `available`(금액 있음)·`budget_not_set`(앱 예산 설정 전, 연동은 유지)·`not_received`(아직 한 번도 받지 못함)이고 금액은 `available`일 때만 있다. 금액은 앱 서버 값 그대로다(웹에서 계산하지 않음). `linkId`는 응답·로그에 넣지 않는다.

소셜 로그인 규칙은 project2와 같다. 공급자가 **확인한** 이메일이 같은 웹 계정이 있으면 그 계정에 로그인 수단을 붙이고 기존 웹 세션을 끊는다. 그 뒤로는 비밀번호 로그인이 401 `SOCIAL_ACCOUNT`(+`provider`)로 안내된다. 같은 공급자의 다른 계정은 붙이지 않는다(`email_in_use`). 확인되지 않은 이메일은 저장하지도 연결에 쓰지도 않는다. **앱 계정은 보지 않는다**(04 §4).

토큰: HS256, 30일, 클레임 `sub`(웹 회원 id)·`tv`(토큰 버전)·`iss=flexable-web`. 서명 키는 웹 전용(`WEB_JWT_SECRET`)이고 `iss`도 검사하므로 앱 토큰은 통과하지 못한다. 요청마다 `user_credentials.token_version`과 `tv`를 비교해 로그아웃·탈퇴된 토큰을 거절한다.

## 로컬 실행

```bash
cd backend
./gradlew test                                              # 테스트(H2 메모리 DB, 실행마다 임의 서명 키)
./gradlew bootRun --args='--spring.profiles.active=local'   # MySQL 없이 H2 파일 DB(build/localdb/)로 실행
curl http://localhost:8080/api/v1/health                    # {"status":"UP"}
```

`local` 프로필은 `WEB_JWT_SECRET`이 없으면 실행할 때마다 임의 키를 만든다(재시작하면 다시 로그인). 앱 연동은 `APP_LINK_MODE=snapshot`(앱 서버 없이 고정 데이터, 앱 코드 규칙에 맞는 아무 8자리, 예: `K7M2-Q9XB`)이 기본이다. 재시작하면 연동을 읽을 수 없으므로 [해제] 후 다시 연동한다. 웹 화면(`npm run dev`)의 `/api` 프록시는 기본 `http://localhost:8080`을 본다. worker 실행은 `--spring.profiles.active=worker`(HTTP 없음).

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
| `APP_LINK_BASE_URL` | 앱 서버 주소(`/internal/v1` 앞까지). 비어 있으면 [앱 연동하기]가 503 | 없음 |
| `APP_LINK_SERVICE_KEY` | `X-Service-Key` 값. 앱 서버 `WEB_LINK_SERVICE_KEYS` 중 하나와 같아야 한다(32자 이상) | 없음 |
| `APP_LINK_ENCRYPTION_KEY` | `linkId` 암호화 키(Base64, 32바이트, 예: `openssl rand -base64 32`). `APP_LINK_BASE_URL`이 있으면 필수(없으면 시작 실패). **바꾸면 저장된 연동을 읽을 수 없다**(사용자가 해제 후 다시 연동해야 함) | 없음 |
| `APP_LINK_MODE` | `http`(앱 서버 호출) 또는 `snapshot`(고정 데이터, 시연용) | `http`(`local` 프로필은 `snapshot`) |

## 데이터

Flyway `src/main/resources/db/migration`. `V1__web_accounts.sql`: `users`(user: 이메일·동의 시각), `user_settings`(user), `user_credentials`(auth: 비밀번호 해시·토큰 버전). `V2__social_login.sql`: `user_identities`(auth: 소셜 로그인 수단), 소셜 가입을 위해 `users.email`·`user_credentials.password_hash`를 비울 수 있게 함. `V3__app_links.sql`: `app_links`(applink: 웹 회원당 하나, 암호화한 `linkId`, 앱에서 마지막으로 받은 회원 정보·시드머니와 조회 시각). 앱 DB와 외래 키는 없다.

## 아직 정해지지 않은 것

경계 문서 §10을 본다.
