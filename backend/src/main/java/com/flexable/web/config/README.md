# config
보안(필터·CORS), 실행 프로필(`api`/`worker`), `Clock` 같은 설정 빈. 도메인 로직은 두지 않는다.
`worker` 프로필은 HTTP를 열지 않고(`spring.main.web-application-type=none`, `application-worker.yml`) `ingest` 작업만 켠다. 이때 보안 필터 체인은 만들지 않는다.

- `SecurityConfig`: 무상태 Bearer JWT. 공개 경로는 `POST /api/v1/auth/signup`·`/login`, `/api/v1/health`, `/actuator/health/**`. 토큰 검증은 `auth.TokenService`·`TokenAuthenticationConverter`를 쓴다. 401 본문은 `{code:"UNAUTHORIZED"}`
- `CorsProperties`(`app.cors-origins`): 로컬 개발 서버처럼 다른 출처만. 운영은 프록시로 같은 출처
- `TimeConfig`: `Clock`(UTC). 테스트에서 바꿔 끼운다
