# 백엔드(Spring) 지침

루트 `AGENTS.md`의 공통 지침에 더해 `backend/`에서만 지킬 것.

- 빌드·테스트: `./gradlew build`(테스트 포함), 테스트만 `./gradlew test`. Java 21, Spring Boot 4, Gradle. 테스트 DB는 H2 메모리.
- API 계약: [README "API"](README.md#api). 응답 형식을 바꾸면 같은 PR에서 계약을 고치고 `spec-change` 라벨을 붙인다. 오류는 `{ code, message, ... }`, 시각은 `+09:00`이 붙은 ISO-8601이다.
- 금액은 원 단위 정수, 나눗셈은 내림. 계산 규칙은 README "API" 아래 계산 절과 [goal-ai.md](../docs/product/goal-ai.md)를 따른다.
- 패키지 의존 방향은 [README "패키지"](README.md#패키지) 표를 따른다. 방향을 바꾸면 표와 `architecture/PackageDependencyTest`의 `ALLOWED`를 함께 고친다. 앱 서버 호출은 `applink` 한 곳에서만 한다.
- DB 변경은 Flyway 새 버전 파일로만 한다. 이미 머지된 마이그레이션은 고치지 않는다. 번호는 `main`과 열린 PR의 마이그레이션 번호를 확인하고 정한다.
- 외부 호출(앱 서버·OpenAI·키움·KRX·OpenDART)이 실패해도 핵심 기능은 동작해야 한다.
  - AI 안내 실패: 기본 안내와 `fallbackReason`을 돌려준다(goal-ai.md).
  - 앱 서버 장애: 저장한 마지막 값과 `sync.status: "stale"`을 돌려준다.
  - 시세 미수집: 503 `MARKET_UNAVAILABLE`을 돌려준다.
- 비밀 값은 `backend/.env`(양식 `.env.example`)에만 둔다. 로그에 토큰·`linkId`·프롬프트 본문을 남기지 않는다.
