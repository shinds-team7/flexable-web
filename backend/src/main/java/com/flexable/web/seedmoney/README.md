# seedmoney
웹의 시드머니(`GET /api/v1/me/seed-money`, `SeedMoneyController`). 지금은 **앱 연동 값만** 내보낸다. 앱과 연동돼 있으면 `applink`가 받은 앱 확정 값(`total`·`base`·`monthlyGoal`·`startedOn`·주기별 반영 기록 `entries`)을 받은 시각과 함께 그대로 쓰고, 연동이 없으면 `source: "none"`에 나머지는 `null`이다. 앱 원천 데이터(수입·지출)를 받거나 다시 계산하지 않는다. 정의는 `docs/product/decisions.md` 2026-10-20 ②, 계약은 경계 문서 §5-2.

웹에서 직접 입력한 시드머니를 저장하는 API·컬럼은 없다. 홈의 [수정하기]는 브라우저 탭 메모리에만 두고 새로고침하면 사라진다(`src/data/home.ts`). 목표(`engagement`)의 직접 입력 현재 금액은 `goals.current_amount`에 따로 저장한다.
