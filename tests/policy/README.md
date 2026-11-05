# 정책 공통 테스트 케이스

[`docs/policies.md`](../../docs/policies.md)의 입력→기대값 예시 표를 그대로 옮긴 JSON이다. 백엔드 테스트가 이 파일을 읽어 코드와 맞는지 확인한다.

| 파일 | 정책 | 읽는 테스트 |
|---|---|---|
| `goal.json` | §3 목표 계산 | `backend/src/test/.../engagement/GoalPolicyTest` |
| `simulation.json` | §2 투자 시뮬레이션(비율·배분·수익률·납입과 평가) | `backend/src/test/.../simulation/SimulationPolicyTest` |
| `deposit.json` | §6 정기예금 만기 계산(단리·월복리·내림·세금·가입 한도) | `backend/src/test/.../deposit/DepositPolicyTest` |
| `practice.json` | §5 사건 퀴즈 투자 시뮬레이션(정수 주 매매·평가·퀴즈 판정) | `backend/src/test/.../practice/PracticePolicyTest` |
| `virtual-simulation.json` | §8 가상 시뮬레이션(날짜·사건 위치·룰셋 추출·봉 만들기·자동 검사, 매매·평가는 `practice.json` 재사용, 채점 없음 `noScore`(#253)). `IMPLEMENTED` | 구현 PR의 `backend/src/test/.../virtualsim/VirtualSimPolicyTest` |
| `virtual-contest.json` | §8-8 가상 시뮬레이션 대회(배치고사·잔액 이어 가기·청산·하루 판 수·하루 점수·주간 승급/강등·판별 후보·순위, 매매·평가는 `practice.json`·`virtual-simulation.json` 재사용). `IMPLEMENTED` | `backend/src/test/.../virtualsim/VirtualContestPolicyTest` |
| `goal-scenarios.json` | §7 목표 달성 시나리오(F7 v2: 적금·CMA·투자 계산, 배분, 필요 월 금액, 분위, 입력·제안 검증) | `backend/src/test/.../goalscenario/GoalScenarioPolicyTest` |

- 정책을 바꾸면 `policies.md` 표와 이 JSON을 같은 PR에서 고치고 `spec-change` 라벨과 CHANGELOG 한 줄을 붙인다(CODEOWNERS 리뷰).
- 실행: `cd backend && ./gradlew test --tests "*PolicyTest"`(CI의 `./gradlew build`에 포함). 테스트는 `backend/` 기준 `../tests/policy/`를 읽는다.
