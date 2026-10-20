# user
웹 회원 정보·웹 설정·동의 기록. 웹 탈퇴 시 각 패키지의 웹 데이터 삭제와 `applink` 연동 해제를 조정한다.

| 파일 | 내용 |
|---|---|
| `UserService` | 이 패키지의 공개 입구. `register`(이메일 정규화·중복 확인, 약관·개인정보 동의 시각 기록, 기본 설정 생성), `findIdByEmail`, `profile`, `settings`·`updateSettings`, `withdraw` |
| `UserController` | `GET`·`PATCH /api/v1/me/settings`. `GET /me`는 로그인 방법을 함께 내보내야 해서 `auth`가 `UserService.profile`로 만든다 |
| `User`·`UserSettings`(+Repository) | `users`, `user_settings`. 이 패키지 밖에서 쓰지 않는다 |
| `UserWithdrawalListener` | 탈퇴 때 자기 데이터를 지울 패키지가 구현한다. `withdraw`가 회원 행을 지우기 전에 같은 트랜잭션에서 부른다 |

- 설정: `theme`(light 기본, dark), `seenTours`(본 안내 키, 병합만), `disclaimerAckAt`(과거 계산 고지 확인 시각, 서버 시각). 테마 기본은 라이트이고 시스템 설정을 따르지 않는다(AGENTS.md).
- 탈퇴 본인 확인(비밀번호)은 `auth`가 끝낸 뒤 `withdraw`를 부른다. `applink`가 생기면 `withdraw`에서 연동 해제를 요청한다(경계 문서 §4·§5-3).
