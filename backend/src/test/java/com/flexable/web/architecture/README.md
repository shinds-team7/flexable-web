# architecture 테스트
`backend/README.md`의 패키지 의존 표를 `PackageDependencyTest`(ArchUnit)로 강제한다.

- 표에 없는 방향의 import, 표에 없는 패키지가 생기면 실패한다. `common`은 누구나 쓸 수 있다. 표는 **허용**하는 방향이며, 실제 코드가 그 방향을 모두 쓰는 것은 아니다(예: `simulation`은 지금 `market`만 쓴다).
- 다른 패키지의 엔티티·Repository를 쓰면 실패한다(`config`만 예외).
- HTTP 클라이언트(`RestClient`·`RestTemplate`·`HttpClient`·`WebClient`)는 `applink`(project2 호출), `ingest`(외부 수집), `auth`(소셜 로그인 공급자), `ai`(목표 안내 OpenAI 호출), `newssearch`(사건 뉴스 NAVER API HUB 검색)에서만 쓴다.

표를 고치면 테스트의 `ALLOWED`도 같은 PR에서 고친다.
