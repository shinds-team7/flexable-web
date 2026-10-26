# seedmoney
웹의 시드머니(`GET /api/v1/me/seed-money`, `PUT·DELETE /api/v1/me/seed-money/manual`, `SeedMoneyController`).

- 앱 연동 값: 앱과 연동돼 있으면 `applink`가 받은 앱 확정 값(`total`·`base`·`monthlyGoal`·`startedOn`·주기별 반영 기록 `entries`)을 받은 시각과 함께 그대로 쓰고, 연동이 없으면 `source: "none"`에 앱 값 필드는 `null`이다. 앱 원천 데이터(수입·지출)를 받거나 다시 계산하지 않는다. 정의는 `docs/product/decisions.md` 2026-10-20 ②, 계약은 경계 문서 §5-2.
- 직접 고친 값(`SeedMoneyManual`, `seed_money_manual`): 홈 [수정하기]로 회원이 저장한 금액(0~10억 원). 응답 `manual`로 함께 내보내고, 있으면 화면·시뮬레이션은 앱 값 대신 이 값을 쓴다(decisions 2026-10-24 ②). 앱 값 필드는 바꾸지 않는다. 되돌리기(`DELETE`)·탈퇴(`UserWithdrawalListener`, FK CASCADE) 때 지운다.
- 앱 서버 조회(`AppLinkService.status`)는 트랜잭션 밖에서 하고, 직접 고친 값은 따로 읽는다.
- 목표(`engagement`)는 `get`의 앱 값만 읽고 `manual`은 쓰지 않는다(10-26 F7 재정리 전까지 목표의 직접 입력 값을 그대로 씀).
