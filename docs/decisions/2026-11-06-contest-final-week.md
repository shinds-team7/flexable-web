# 가상 시뮬레이션 대회 마지막 주: 4주차를 22일~말일로 묶고, 대회 마지막 날 판정해 결과만 기록한다(보너스 주)

- 날짜: 2026-11-06 · 결정한 사람: 사용자 · 관련: PR #306(Issue "29일~말일 주 판정")
- 영향: 웹 백엔드(`VirtualContestRules.weeks`·`weekOf`, `VirtualContestService` 하루·주간 판정과 지난 대회 결과), API 계약(`VirtualContest.weeks` 4개, `VirtualContestEntry.week.week` 최대 4, `VirtualContestResult.finalWeek` 추가), 웹 프론트(`/simulation` 월간 대회 규칙·주별 일정·이번 주 점수·지난 대회 카드). DB 스키마·개인정보 처리(이미 저장하던 `virtual_contest_weeks`를 그대로 씀)·앱·시연은 바뀌지 않는다.
- 기준: [policies](../policies.md) §8-8 "주간 판정"·"월말 정산", [대회 결정](2026-11-05-virtual-sim-contest.md) 4-4·4-5·6-2·7·8, `tests/policy/virtual-contest.json` `rules.weeks`·`weekly`

## 배경

주를 1~7일, 8~14일, 15~21일, 22~28일, 29일~말일로 나누면 29일~말일 주(1~3일)는 ±4(#308 이후 ±400)에 닿을 수 없어 판이 바뀌지 않고, 월말 정산도 마지막 주를 판정하지 않았다. 사용자가 마지막 주가 왜 "판정 없음"인지 헷갈렸다. 남은 날 수에 맞춘 기준(예: 2일이면 ±2)도 생각했지만, 판정 직후 대회가 끝나 바뀐 판이 최종 순위를 매기는 판만 바꾸고 랭킹 확정과 보상(대회 결정 8)이 흔들린다.

## 결정

1. **주는 네 개다: 1~7일, 8~14일, 15~21일, 22일~말일.** 4주차는 달에 따라 7~10일이다(평년 2월 7일, 윤년 2월 8일, 30일 달 9일, 31일 달 10일). 기준은 다른 주와 같은 ±4다(#308 이후 ±400, 하루 점수 100점 단위).
2. **4주차는 대회 마지막 날 점수를 정한 뒤 판정한다.** 다른 주와 같이 주 점수(하루 점수의 합)로 승급·강등·그대로를 정하고 `virtual_contest_weeks`에 한 번 기록한다.
3. **4주차 판정은 판을 바꾸지 않는다(보너스 주).** 판·잔액·판 점수·가장 높이 오른 판(`highestBoard`)은 그대로이고, 최종 순위는 4주차를 보낸 판에서 매긴다(대회 결정 6-2·7). 판정 결과는 지난 대회 결과의 `finalWeek`(`points`, `result` = `PROMOTE`·`DEMOTE`·`STAY`)로 보인다. 1억 판의 +4 이상, 1천만 판의 −4 이하(#308 이후 +400 이상·−400 이하)는 다른 주처럼 `STAY`다.
4. **화면**: 규칙과 주별 일정에서 4주차를 "보너스 주"라고 알리고, 이번 주 점수에 "보너스 주(판은 그대로)"를 붙인다. 지난 대회 카드에 "보너스 주 점수"와 승급 기준 도달(빨강 ▲)·강등 기준 도달(파랑 ▼)을 보인다.
5. **보상(대회 결정 8)**: 지금은 순위·판이 바뀌지 않으므로 영향이 없다. `finalWeek`를 보상에 쓸지는 보상 Issue에서 정한다.

## 이유

- 마지막 주를 7일 이상으로 만들어 다른 주처럼 ±4(#308 이후 ±400)를 노릴 수 있게 하면서, 판정 직후 대회가 끝나 최종 순위의 판이 바뀌는 문제를 피한다. 판이 바뀌면 판 점수가 0부터 다시 쌓여(대회 결정 7-1) 승급한 사람이 윗판에서 0점으로 순위가 매겨지기 때문이다.
- 남은 날 수에 맞춘 기준은 달마다 기준이 달라 설명이 어렵다.

## 개발이 정한 것

- 4주차가 7~10일로 길어 다른 주보다 ±4(#308 이후 ±400)에 닿기 쉽다. 판이 바뀌지 않아 그대로 둔다.
- 이 규칙 전에 정산한 대회처럼 4주차 판정 기록이 없으면 `finalWeek`는 `null`이다. 2026-11 대회는 22일 전에 배포하면 새 규칙으로 4주차(22~30일)를 판정한다. 22일 이후 배포라면 이미 4주차(22~28일) 판정이 판을 바꿨을 수 있다(대회 결정 4-4의 규칙).

## 바뀌는 것

| 무엇 | 어디 |
|---|---|
| 문서 | 이 기록, [policies](../policies.md) §8-8 "주간 판정"·"월말 정산"·주간 판정 예시, [대회 결정](2026-11-05-virtual-sim-contest.md) 4-4·4-5·6-2와 변경 기록, [결정 목록](README.md), [CHANGELOG](../CHANGELOG.md) |
| 테스트 | `tests/policy/virtual-contest.json` `rules.weeks`(`[22, 31]`)·`weekly`(4주차 예시 `finalWeek`·`judged`), `VirtualContestPolicyTest`, `VirtualContestApiTest`(4주차 판정 기록·판 그대로·`finalWeek`) |
| 계약 | [web-api.yaml](../contracts/web-api.yaml) `VirtualContest.weeks`(4개)·`VirtualContestEntry.week.week`(최대 4)·`VirtualContestResult.finalWeek`, `src/lib/api-schema.d.ts` |
| 코드 | `VirtualContestRules`(`WEEKS`, `weeks`, `weekOf`, `outcome`), `VirtualContestService`(`catchUp`·`finalWeek`), `VirtualContestStore.week`, `VirtualContestDtos.FinalWeek`, `src/pages/VirtualContest.tsx` |
