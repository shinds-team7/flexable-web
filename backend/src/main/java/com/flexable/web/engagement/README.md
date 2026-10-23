# engagement
목표(`GoalController`·`GoalService`), 공유(아직 미구현), 자체 지표 이벤트(아직 미구현). 지표에 사용자 id·금액·이메일을 저장하지 않는다.

- 목표 계산은 `GoalMath` 순수 함수가 맡고, 앱 시드머니는 `SeedMoneyService` 공개 API로 읽는다.
- `GoalCoachText`가 자리표시자·스키마·길이·금지 표현을 검사하고 서버 숫자로 치환한다. 기본 안내도 같은 검사를 통과한다.
- `GoalCoachQuota`는 회원·날짜별 3회와 회원 정보 없는 전체 일일 300회를 DB에서 예약한다. 키가 없거나 캐시를 반환하면 차감하지 않는다. 전체 상한이면 회원 예약을 되돌린다. 외부 호출을 기다리는 동안 DB 잠금이 없다.
- 목표 삭제는 목표·코치만 지우며 사용 횟수는 유지한다. 탈퇴는 회원별 사용량까지 지우고 `ai_daily_usage`는 남긴다. 목표 id·버전·요청 시작 시각으로 늦게 온 응답을 방어한다.
- `GoalCoachUsageCleanupJob`은 api(`!worker`)에서 매일 03:40 KST에 `goal_coach_usage`의 `usage_date <= 오늘 − 7일` 행을 삭제한다(웹 방침 제4조). 키가 없어도 실행하며, 회원 정보 없는 `ai_daily_usage`·목표·코치는 유지한다. 실행 시각은 `app.goal.coach.cleanup-cron`으로 바꿀 수 있다.
- 구현 계약은 [`docs/product/goal-ai.md`](../../../../../../../../docs/product/goal-ai.md). 실제 OpenAI·VM 연결은 별도 검증한다.
