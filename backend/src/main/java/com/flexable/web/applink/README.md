# applink — [앱 연동하기]와 project2 호출의 유일한 출입구

웹 백엔드에서 project2를 부르는 코드는 **여기에만** 둔다. 다른 패키지는 이 패키지가 공개한 인터페이스와 DTO만 쓴다. 절차·API·오류 처리는 경계 문서 §5가 정본이다.

| 파일 | 내용 |
|---|---|
| `AppLinkController` | `GET`·`POST`·`DELETE /api/v1/app-link`. 대상은 토큰의 웹 회원 id로만 찾는다(브라우저가 보낸 id·linkId를 받지 않음). 계약은 `backend/README.md` "API" |
| `AppLinkService` | 공개 입구. `link`·`status`·`unlink`, 탈퇴 때 `user`가 부르는 `removeForWithdrawal`. 다른 패키지(seedmoney 등)는 `status`의 응답 DTO로 앱 시드머니를 읽는다 |
| `AppLink`(+Repository) | `app_links`. 웹 회원당 하나(`user_id` 고유). 앱에서 마지막으로 받은 회원 정보·시드머니·시작일을 두고 연동과 함께 지운다 |
| `SeedEntry` | `app_link_entries`. 주기별 반영 기록(앱이 준 순서·값 그대로). 조회마다 통째로 바꾸고, 연동 행을 지우면 DB가 함께 지운다 |
| `LinkIdCipher` | `linkId` AES-256-GCM 암호화(`APP_LINK_ENCRYPTION_KEY`) |
| `AppApiClient`·`AppApiException` | 앱 서버 호출 인터페이스와 실패 종류(`Kind`) |
| `http/RestAppApiClient` | 운영. `/internal/v1/web-links/*`를 `X-Service-Key`로 호출(연결 3초·응답 5초, 재시도 없음) |
| `snapshot/SnapshotAppApiClient` | `APP_LINK_MODE=snapshot`. 앱 서버 없는 로컬·시연용 고정 데이터 |

규칙:
- **앱 서버 호출은 DB 트랜잭션 밖**에서 하고 저장·삭제만 짧은 트랜잭션으로 한다.
- **연동 만들기**: 회원별 처리 중 표시(이중 클릭·동시 요청은 409 `APP_LINK_IN_PROGRESS`) + `user_id` 고유 키. 앱에 연동을 만든 뒤 웹 저장이 실패하면 앱 서버에 해제를 요청해 되돌린다(보상). 보낸 뒤 응답을 못 받으면(응답 시간 초과·5xx·응답 해석 실패) 코드가 쓰였는지 알 수 없으므로 **다시 보내지 않고** 502 `APP_LINK_RESULT_UNKNOWN`. 연결 자체를 못 했으면 처리되지 않은 것이라 503 `APP_UNAVAILABLE`.
- **조회**: `LINK_NOT_FOUND`만 웹 연동 삭제로 이어진다(다른 404·5xx·시간 초과는 마지막 값을 `stale`로). `BUDGET_NOT_SET`은 연동 유지. 401·403(서비스 키 오류)은 ERROR 로그 + 사용자에게는 일시 장애로.
- **linkId 노출 금지**: 응답·로그·예외 메시지에 넣지 않는다. 요청 주소에 linkId가 들어가므로 HTTP 클라이언트 예외는 원인을 버리고 종류만 남긴다. HTTP 클라이언트 디버그 로그(`org.springframework.web.client`·`jdk.internal.httpclient`)를 운영에서 켜지 않는다.
- 웹 회원당 코드 실패 10분 5회 제한은 메모리(api 한 대 기준, `common.AttemptLimiter`).
- 웹 해제는 앱 서버에서 먼저 지우고 웹을 지운다. 앱 서버 장애면 연동을 남겨 다시 시도하게 한다. 저장된 값을 읽을 수 없으면(암호화 키 변경) 웹 쪽만 지운다. 탈퇴는 웹을 먼저 지우고 커밋 뒤 앱 서버 해제를 한 번 요청한다(실패해도 탈퇴는 끝남, 앱의 연동 목록에 남으면 앱에서 지울 수 있음).
