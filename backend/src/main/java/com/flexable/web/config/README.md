# config
보안(필터·CORS), 실행 프로필(`api`/`worker`), `Clock` 같은 설정 빈. 도메인 로직은 두지 않는다.
`worker` 프로필은 HTTP를 열지 않고(`spring.main.web-application-type=none`) `ingest` 작업만 켠다.
