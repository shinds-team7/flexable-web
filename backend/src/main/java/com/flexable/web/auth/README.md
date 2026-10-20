# auth
웹 계정의 가입·로그인·로그아웃·탈퇴와 토큰. 웹 DB의 계정을 쓰고 토큰은 웹 백엔드 자체 비밀키(`WEB_JWT_SECRET`)로 발급한다. 앱 계정·앱 토큰과 섞지 않는다. 앱 로그아웃·탈퇴는 웹 세션에 영향을 주지 않는다(경계 문서 §4).

| 파일 | 내용 |
|---|---|
| `AuthController` | `POST /api/v1/auth/signup`·`/login`·`/logout`, `DELETE /api/v1/me`(탈퇴) |
| `AuthService` | 가입(user에 회원 등록 → 비밀번호 해시 저장), 로그인, 로그아웃(`tokenVersion` 증가), 탈퇴(비밀번호 확인 → `UserService.withdraw`). `UserWithdrawalListener`로 자기 행을 지운다 |
| `Credential`·`CredentialRepository` | `user_credentials`(비밀번호 해시·토큰 버전). 이 패키지 밖에서 쓰지 않는다 |
| `TokenService` | HS256 발급·검증. `iss=flexable-web`을 넣고 검사한다. 키가 32바이트 미만이면 시작하지 않는다 |
| `TokenAuthenticationConverter` | 요청마다 `tv`와 저장된 토큰 버전을 비교해 로그아웃·탈퇴된 토큰을 거절한다(config의 보안 필터가 쓴다) |
| `LoginAttemptLimiter` | 이메일별 10분 내 5회 실패 제한(메모리, api 한 대 기준) |

- 회원 정보(이메일·동의)는 `user`가 가진다. auth는 `UserService`만 부르고 `User`·`UserRepository`를 쓰지 않는다.
- 없는 이메일과 틀린 비밀번호는 같은 응답(`INVALID_CREDENTIALS`)과 같은 해시 비교 시간을 쓴다. 같은 이메일의 앱 계정이 있는지는 보지도 알려 주지도 않는다.
- 소셜 로그인은 아직 없다(경계 문서 §10).
