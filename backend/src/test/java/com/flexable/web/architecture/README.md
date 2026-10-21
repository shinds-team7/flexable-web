# architecture 테스트
`backend/README.md`의 패키지 의존 표를 `PackageDependencyTest`(ArchUnit)로 강제한다.

- 표에 없는 방향의 import, 표에 없는 패키지가 생기면 실패한다. `common`은 누구나 쓸 수 있다.
- 다른 패키지의 엔티티·Repository를 쓰면 실패한다(`config`만 예외).
- HTTP 클라이언트(`RestClient`·`RestTemplate`·`HttpClient`·`WebClient`)는 `applink`(project2 호출), `ingest`(외부 수집), `auth`(소셜 로그인 공급자)에서만 쓴다.

표를 고치면 테스트의 `ALLOWED`도 같은 PR에서 고친다.
