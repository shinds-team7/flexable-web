# common
오류 응답 형식(`{ code, message }`, project2와 같음), 금액(원 단위 정수)·날짜(KST) 공통 타입. 어떤 기능 패키지에도 의존하지 않고, 모든 패키지가 쓸 수 있다.

- `ErrorCode`·`ApiException`·`GlobalExceptionHandler`·`ErrorResponses`: 검증 오류는 `VALIDATION_FAILED` + `fields`
- `Times`: `ZONE`(Asia/Seoul), `Instant` → `+09:00` 응답 시각
- `HealthController`: `GET /api/v1/health`
