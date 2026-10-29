# AI 목표 달성(F7) — 기존 v1 구현 명세와 v2 개편 안내

> **시연 화면:** `npm run dev` 후 `/goal/demo`를 열면 로그인·백엔드 없이 고정 예시를 체험할 수 있다. 성향 카드 3개 중 하나(기본 균형형)를 바꾸고, 목표 예시 3개·조합 3개·자산 흐름과 상품 비중을 비교한다. 현재 `/goal`의 실제 기능은 유지한다. 퀴즈·성향 저장과 연결하지 않으며 금액·확률·위험은 실제 AI 계산값이 아니다.

> **2026-10-29 개편 결정:** 새 F7은 성향·목표 금액·기한·월 가용액으로 실제 금융상품·종목명·배분 비중이 다른 시나리오와 달성 추정 확률·위험을 비교한다([새 결정](../decisions/2026-10-29-goal-scenarios.md)). 맞춤 상품·비중 제안 제외는 폐지한다. 신규 AI 서버는 미구축이며 FastAPI 후보, 계산 모형·입출력 계약은 후속 확정이다. 성향 퀴즈는 팀원 범위로 이 작업에서 수정하지 않는다.
>
> **이하 §1~§7은 운영 중인 v1의 동작·검사·당시 분업 기록**이다. 상품명·금융 용어·추천 문구 차단은 현재 코드 설명이며 v2 요구사항이 아니다. 기존 공개 API 정본은 [`web-api.yaml`](../contracts/web-api.yaml), 새 방향은 위 결정 기록을 따른다. 새 계약 승인 전에는 현재 API·계산을 변경하지 않는다.

> 2026-10-23 사용자 결정으로 F7 웹 목표를 해커톤 범위에 다시 넣고, 목표 안내 문장을 OpenAI로 만든다([decisions](decisions.md) 2026-10-23). 확정 8의 "실시간 AI 생성 제외"는 이 화면에 한해 바꾼다. 사건 설명(insight)은 그대로 사전 생성·검수다.
> 이 문서는 기존 백엔드(`backend/`)와 화면(`src/`)의 구현 설명이다. v2 구현 전에는 새 계산 정책·웹/신규 서버 계약을 먼저 확정한다.

## 1. 무엇을 하나

사용자가 목표(종류·이름·금액·기한)를 하나 정하면 **서버가 숫자를 모두 계산**하고(진행률·남은 금액·매달 필요 금액·예상 도달 월·시나리오·중간 점검표), **AI는 숫자 없이 자리표시자로 안내 문장만 쓴다**(한 줄 요약·설명·실천 단계 3개). 서버가 문장을 검사한 뒤 자리표시자를 계산값으로 바꿔 넣는다. 검사를 통과하지 못하거나 키가 없으면 정해 둔 기본 안내 문장으로 대신한다.

- 목표는 무료, 계정당 1개(확정 2·01 §5-3). 로그인 필요.
- **AI 안내는 무료 회원당 하루 3회**(Asia/Seoul 기준). 넘으면 플러스 안내를 보여 준다. 지금은 모의 결제라 서버가 구독자를 구분하지 않으므로 플러스 한도는 실결제(billing)가 붙을 때 정한다(2026-10-23 사용자 결정).
- 시드머니 출처: 앱 연동이 되어 있고 시드머니가 `available`이면 앱 값(`total`, 저축 속도 = `monthlyGoal`). 아니면 사용자가 목표 화면에서 넣은 "지금 모은 돈"·"매달 모을 수 있는 돈"(직접 입력, 선택).
- 기존 v1 AI가 하지 않는 것(현재 코드): 숫자 쓰기·계산, 금융 상품·금융회사·종목 이름, 투자·가입 권유, "추천". 실천 단계는 앱의 하루 예산·남긴 돈 반영·점검 같은 **행동**에 대한 것만. **이 제한은 새 F7의 제품 범위에서 해제했으며**, v2는 확인된 실제 상품·종목·비중과 계산 결과를 제안·설명한다.
- 외부 전송: OpenAI에 보내는 것은 목표 **종류**·금액·기한·계산된 숫자뿐이다. 목표 이름(자유 입력), 이메일, 회원 id는 보내지 않는다. `store: false`. 그래도 OpenAI가 악용 모니터링 기록을 최대 30일 보관할 수 있으므로 개인정보처리방침의 국외 이전 항목에 적는다.
- 서비스 경계 예외: "외부 API는 worker만 호출한다"(04 §8)의 예외로, api 프로필이 코치 요청 중에 OpenAI를 부른다.

## 2. 계산 규칙(서버, 원 단위 정수)

기준 달 `thisMonth` = 서버 시계의 Asia/Seoul 현재 달.

| 값 | 규칙 |
|---|---|
| `current` | 앱 값이면 `total`, 아니면 `currentAmount ?? 0` |
| `pace` | 앱 값이면 `monthlyGoal`, 아니면 `monthlyPace`. 0이면 null로 본다 |
| `remaining` | `max(0, amount − current)` |
| `monthsLeft` | `thisMonth`에서 `dueMonth`까지 달 차이(2026-10 → 2027-10 = 12). 시간이 지나면 0(기한이 이번 달)이나 음수(기한 지남)가 될 수 있다 |
| `calcMonths` | `max(1, monthsLeft)` — 나눗셈에만 쓴다(0으로 나누지 않음) |
| `status` | `remaining = 0` → `REACHED` / `monthsLeft < 0` → `OVERDUE` / `pace` 없음 → `NO_PACE` / `expectedMonths ≤ calcMonths` → `ON_TRACK` / 그 밖 → `BEHIND` |
| `requiredMonthly` | `REACHED` 0, `OVERDUE` null, 그 밖 `ceil(remaining ÷ calcMonths ÷ 1000) × 1000`(천 원 단위 올림, 부족하게 보이지 않게. F7) |
| `ratioBp` | `min(10000, floor(current × 10000 ÷ amount))` (만분율) |
| `expectedMonths` | `remaining = 0`이면 0, `pace`가 있으면 `ceil(remaining ÷ pace)`, 아니면 null |
| `expectedMonth` | `thisMonth + expectedMonths`(`YYYY-MM`), `expectedMonths`가 null이면 null |
| `monthlyGap` | `BEHIND`일 때 `requiredMonthly − pace`, 아니면 0 |
| `dailyGap` | `monthlyGap > 0`이면 `ceil(monthlyGap ÷ 30 ÷ 100) × 100`(백 원 단위 올림), 아니면 0 |

시나리오(`REACHED`면 빈 배열). 조건이 맞지 않는 항목은 빼고, 순서는 표 순서:

| key | 조건 | monthly | reachMonth |
|---|---|---|---|
| `KEEP_PACE` | `pace` 있음 | `pace` | `expectedMonth` |
| `MEET_DUE` | `OVERDUE` 아님 | `requiredMonthly` | `dueMonth` |
| `EXTEND_6` | 항상 | `OVERDUE` 아니면 `ceil(remaining ÷ (calcMonths + 6) ÷ 1000) × 1000`, `OVERDUE`면 `ceil(remaining ÷ 6 ÷ 1000) × 1000` | `OVERDUE` 아니면 `dueMonth + 6`, `OVERDUE`면 `thisMonth + 6` |

중간 점검표 `checkpoints`(`REACHED`·`OVERDUE`면 빈 배열): 남은 금액의 25·50·75·100% 지점. `requiredMonthly`로 모은다고 할 때 각 지점에 닿는 달 = `thisMonth + ceil(remaining × p ÷ requiredMonthly)`(모든 지점은 `dueMonth`를 넘지 않게 `min`), 그때 금액 `target = current + floor(remaining × p)`(100%는 `amount`). `{percent: 25|50|75|100, month, target}`.

## 3. API(웹 백엔드 `/api/v1`, Bearer)

`ai` 블록(아래 GET·PUT 응답 공통): `{available: boolean, plan: "FREE", limitPerDay: 3, remainingToday: number}`. `available` = 서버에 `OPENAI_API_KEY`가 있는지. 키가 없으면 `remainingToday = limitPerDay`(차감하지 않으므로).

### GET /me/goal

200 `{goal: Goal | null, ai}`

### PUT /me/goal

요청 `{category, name, amount, dueMonth, currentAmount?, monthlyPace?}` → 200 `{goal: Goal, ai}`. 없으면 만들고 있으면 바꾼다. 바꿀 때마다 목표 `version`을 1 올린다. 저장된 코치는 지우지 않고, facts가 달라졌으면 `stale`로 보인다(§3 Coach). 이름만 바꾸면 facts가 같으므로 `stale=false`다(이름은 AI에 보내지 않는다).

| 필드 | 규칙(어기면 400 `VALIDATION_FAILED` + `fields: {필드: 메시지}`, 기존 오류 형식) |
|---|---|
| `category` | `EMERGENCY`(비상금)·`TRAVEL`(여행)·`DEVICE`(전자기기)·`TUITION`(등록금·학비)·`HOUSING`(독립·보증금)·`OTHER`(기타) |
| `name` | 앞뒤 공백 제거 후 1~20자 |
| `amount` | 10,000 ~ 1,000,000,000 |
| `dueMonth` | `YYYY-MM`, `thisMonth` 다음 달 ~ 120개월 뒤 |
| `currentAmount` | 선택, 0 ~ 1,000,000,000. 앱 값이 있으면 저장은 하되 계산에 쓰지 않는다 |
| `monthlyPace` | 선택, 0 ~ 100,000,000. 위와 같음 |

### DELETE /me/goal

204. 목표·코치를 지운다. 오늘 사용 횟수는 그대로 둔다(지웠다 다시 만들어 횟수를 되돌리지 못하게). 없어도 204.

### POST /me/goal/coach

목표가 없으면 404 `NOT_FOUND`. 200 `{coach: Coach, ai}`.

1. 시작할 때 목표 `id`·`version`과 facts를 읽는다. facts = `category`, `amount`, `dueMonth`, `thisMonth`, `seed.source`, `progress` 전부, `scenarios`, `checkpoints`(이름 제외). 정렬된 키로 직렬화한 JSON의 SHA-256 = `factsHash`.
2. 저장된 코치의 `factsHash`가 같고 `aiGenerated = true`면 그대로 돌려준다(차감 없음).
3. 키가 없으면 기본 안내(`aiGenerated=false`, `fallbackReason: "AI_UNAVAILABLE"`)를 저장·반환한다(차감 없음).
4. **회원 횟수 예약**: 짧은 트랜잭션에서 `goal_coach_usage`(회원·날짜)를 `count < limitPerDay` 조건부 증가로 원자적으로 1 올린다. 실패하면 429 `TOO_MANY_ATTEMPTS` + `retryAfterSeconds`(다음 날 0시까지) + `plan: "FREE"` + `limitPerDay`. 화면은 이 응답에 플러스 안내를 보여 준다.
5. **전체 횟수 예약**: 짧은 트랜잭션에서 `ai_daily_usage`(날짜, 회원 정보 없음)를 `count < dailyCap` 조건부 증가로 원자적으로 1 올린다. 실패하면 4의 회원 예약을 되돌리고(1 내림) 기본 안내(`fallbackReason: "DAILY_CAP"`)를 저장·반환한다.
6. 트랜잭션·잠금 없이 OpenAI를 부른다. 예약한 횟수는 성공·실패와 상관없이 되돌리지 않는다. 실패(시간 초과·4xx·5xx·JSON 아님)면 기본 안내(`fallbackReason: "AI_FAILED"`), 검사(§4) 실패면 기본 안내(`fallbackReason: "AI_REJECTED"`). 다시 보내지 않는다.
7. **저장 직전 확인**(트랜잭션 + 목표 행 잠금): 회원·목표가 남아 있고 `id`·`version`이 1에서 읽은 값과 같아야 한다. 아니면 저장하지 않고 409 `GOAL_CHANGED`(새 오류 코드)를 돌려준다(화면은 목표를 다시 읽는다). 또 저장된 코치의 `requestedAt`이 이 요청의 시작 시각보다 늦으면(더 나중에 시작한 요청이 먼저 저장됨) 덮어쓰지 않고 저장된 쪽을 돌려준다.
8. 결과를 회원당 1행으로 저장(덮어쓰기). `requestedAt` = 1의 시작 시각.

`Goal`

```json
{
  "id": 12, "version": 3,
  "category": "EMERGENCY", "name": "비상금", "amount": 1000000, "dueMonth": "2027-10",
  "currentAmount": null, "monthlyPace": null,
  "createdAt": "2026-10-23T10:00:00+09:00", "updatedAt": "2026-10-23T10:00:00+09:00",
  "seed": { "source": "app", "current": 470000, "pace": 78000, "asOf": "2026-10-23T09:58:00+09:00", "appStatus": "available" },
  "progress": {
    "thisMonth": "2026-10", "current": 470000, "remaining": 530000, "ratioBp": 4700,
    "monthsLeft": 12, "requiredMonthly": 45000, "expectedMonths": 7, "expectedMonth": "2027-05",
    "status": "ON_TRACK", "monthlyGap": 0, "dailyGap": 0
  },
  "scenarios": [
    { "key": "KEEP_PACE", "monthly": 78000, "reachMonth": "2027-05" },
    { "key": "MEET_DUE", "monthly": 45000, "reachMonth": "2027-10" },
    { "key": "EXTEND_6", "monthly": 30000, "reachMonth": "2028-04" }
  ],
  "checkpoints": [
    { "percent": 25, "month": "2027-01", "target": 602500 },
    { "percent": 50, "month": "2027-04", "target": 735000 },
    { "percent": 75, "month": "2027-07", "target": 867500 },
    { "percent": 100, "month": "2027-10", "target": 1000000 }
  ],
  "coach": null
}
```

- `seed.source`: `app` | `manual`. `appStatus`: 앱 연동이 있으면 앱 시드머니 `status`(`available`·`budget_not_set`·`not_received`), 없으면 null. 앱 연동이 있어도 `available`이 아니면 `source: manual`.
- `seed.asOf`: 앱 값이면 앱 시드머니 `updatedAt`, 직접 입력이면 목표 `updatedAt`.
- `coach`: 저장된 최신 `Coach` 또는 null.

`Coach`

```json
{
  "aiGenerated": true, "model": "gpt-4o-mini", "fallbackReason": null,
  "generatedAt": "2026-10-23T10:01:00+09:00", "stale": false,
  "headline": "지금 속도면 2027년 5월에 닿아요",
  "summary": "…(치환 뒤 220자 이내)",
  "steps": [ { "title": "…", "detail": "…" } ],
  "noticeKey": "GOAL_AI",
  "notice": "AI가 내 목표 숫자로 쓴 안내예요. 금융 상품 추천이나 투자 권유가 아니고, 실제 결과는 달라질 수 있어요."
}
```

- 문장은 **자리표시자를 치환한 뒤**의 값이다. 화면은 받은 그대로 보여 준다.
- `stale` = 저장된 `factsHash` ≠ 지금 facts의 해시(금액·기한·종류 수정, 시드머니 변화, 달이 바뀜). GET 때 계산한다.
- `aiGenerated=false`면 `model`은 null, `notice`는 "정해 둔 기본 안내예요. 금융 상품 추천이나 투자 권유가 아니에요."
- `steps`는 정확히 3개.

## 4. 기존 v1 AI 호출·검사(서버, v2 금지 규칙 아님)

- OpenAI Chat Completions(`POST {OPENAI_BASE_URL}/chat/completions`), `response_format: json_schema`(strict) — `{headline, summary, steps[]{title, detail}}`. strict 모드가 지원하는 스키마 키워드가 제한적이라 개수(3개)·길이는 서버 검사가 맡는다. `gpt-5` 계열처럼 `temperature`를 받지 않는 모델로 바꿀 때는 이 값을 함께 고친다. `temperature` 0.4, `max_completion_tokens` 600, `store: false`, `user` 필드 보내지 않음. 연결 3초·응답 20초.
- 시스템 프롬프트(코드 상수, 버전 `goal-coach-v1`): 말투 "~해요". **숫자를 직접 쓰지 말고 자리표시자만 쓴다**(아래 표). 금융 상품·금융회사·종목 이름 금지, 권유·단정 금지. 실천 단계는 앱 하루 예산·남긴 돈 반영·점검 날짜 같은 행동만. `status`별 방향: REACHED 축하·유지, ON_TRACK 속도 유지, BEHIND 격차를 `{dailyGap}`으로, NO_PACE 저축 속도 입력 안내, OVERDUE 기한 새로 정하기 안내.
- 사용자 메시지: facts JSON + 이번 요청에서 쓸 수 있는 자리표시자 목록(값이 null인 것은 목록에서 뺀다).

자리표시자(서버가 치환. 금액은 `45,000원`, 달은 `2027년 10월`, 개월은 `12개월`, 비율은 `47%`):

| 자리표시자 | 값 |
|---|---|
| `{amount}` `{current}` `{remaining}` | 목표 금액·지금 모은 돈·남은 금액 |
| `{requiredMonthly}` `{pace}` `{monthlyGap}` `{dailyGap}` | 매달 필요·저축 속도·월 격차·하루 격차 |
| `{dueMonth}` `{expectedMonth}` `{thisMonth}` | 기한·예상 도달 월·이번 달 |
| `{monthsLeft}` `{expectedMonths}` | 남은 개월·예상 개월(`monthsLeft`는 0 이상일 때만) |
| `{ratio}` | `floor(ratioBp ÷ 100)`% |
| `{extendMonthly}` `{extendMonth}` | `EXTEND_6`의 monthly·reachMonth |

응답 검사(하나라도 걸리면 `AI_REJECTED`):

- 스키마·길이(치환 전 기준 headline 40자, summary 200자, step title 24자, detail 120자, steps 정확히 3개).
- 자리표시자: `{…}`는 모두 이번 요청 목록에 있는 이름이어야 한다. 짝이 맞지 않는 `{`·`}`도 거부.
- 숫자 금지: 자리표시자를 뺀 본문에 아라비아 숫자(전각 포함), `%`, 한자어 수+단위(`[일이삼사오육칠팔구십백천만억]+\s*(원|만|천|억|개월|달|년|퍼센트)` — "만들기"처럼 단위가 없으면 통과), 고유어 수+기간(`(한|두|세|네|다섯|여섯|일곱|여덟|아홉|열)\s*(달|해)`)이 없어야 한다.
- 이름 금지: 자리표시자를 뺀 본문에 영문자(`[A-Za-z]`)가 없어야 한다(브랜드·상품명 차단). 금융 상품·기관 낱말 금지 — 적금·예금·펀드·주식·종목·채권·보험·청약·통장·카드·은행·증권·코인·가상자산·대출·리볼빙·토스·카카오뱅크·케이뱅크·신한·국민은행·우리은행·하나은행·농협·기업은행·새마을금고·우체국.
- 권유·단정 금지어: 추천·권유·사세요·파세요·담으세요·가입하세요·투자하세요·물타기·목표가·저평가·지금이 기회·앞으로 오를·확실히·반드시·보장·떡상·폭망·계좌 연결.
- 통과하면 자리표시자를 치환해 저장한다.

기본 안내(템플릿): `status` 5가지 각각 고정 문장(자리표시자 사용, 같은 치환기로 채움). AI가 꺼져 있어도 화면이 다 동작하게 하는 용도라 문장이 자연스러워야 하고, 템플릿은 §4 검사를 통과해야 한다(테스트로 확인). 적금 비교 같은 화면 안내도 AI가 아니라 화면이 링크로 보여 준다.

로그: 성공·실패·검사 실패를 이유 코드와 토큰 수만 남긴다. 프롬프트·응답 본문·회원 id는 남기지 않는다.

설정(비어 있으면 AI 꺼짐, 비밀 값은 환경변수로만):

| 환경변수 | 기본 |
|---|---|
| `OPENAI_API_KEY` | (없음) |
| `OPENAI_MODEL` | `gpt-4o-mini` |
| `OPENAI_BASE_URL` | `https://api.openai.com/v1` |
| `GOAL_COACH_FREE_DAILY_LIMIT` | 3 |
| `GOAL_COACH_DAILY_CAP` | 300 |

예산(`gpt-4o-mini` 입력 $0.15·출력 $0.60 / 100만 토큰): 1회 입력 약 1.5천·출력 약 0.4천 토큰이면 약 $0.000465, 출력 상한 600이면 1회 최대 약 $0.000585. 하루 상한 300회 기준 최대 약 $0.18. OpenAI 대시보드의 예산 알림은 알림일 뿐 자동 차단을 보장하지 않으므로 **실제 상한은 서버의 `GOAL_COACH_DAILY_CAP`이다.** 프롬프트를 늘리면 다시 계산한다.

## 5. 저장(V8)

- `goals(id BIGINT AUTO_INCREMENT PK, user_id UNIQUE, version INT, category, name, amount, due_month CHAR(7), current_amount NULL, monthly_pace NULL, created_at, updated_at)` — 지웠다 다시 만들면 `id`가 달라진다.
- `goal_coaches(user_id PK, goal_id, goal_version, facts_hash CHAR(64), ai_generated, model NULL, fallback_reason NULL, content JSON, requested_at, generated_at)` — content = 치환 뒤 `{headline, summary, steps}`.
- `goal_coach_usage(usage_date DATE, user_id, count, PK(usage_date, user_id))` — 회원 하루 횟수. **`usage_date`로부터 7일이 지난 행은 반드시 지운다**(웹 방침 제4조에 적은 기간. api 프로필 매일 1회 정리 작업, 예: 03:40 KST). `ai_daily_usage`는 회원 정보가 없어 지우지 않아도 된다.
- `ai_daily_usage(usage_date DATE PK, count)` — 서버 전체 하루 횟수. 회원 정보가 없어 탈퇴해도 줄지 않는다.
- 탈퇴: `UserWithdrawalListener`로 `goals`·`goal_coaches`·`goal_coach_usage`를 지운다(`ai_daily_usage`는 남김). 호출 중에 탈퇴하면 §3 POST 7에서 저장하지 않는다.

## 5-1. 방침 시행

목표 저장과 OpenAI 국외 이전은 웹 방침 개정 사항이다. 웹 회원이 아직 없어 7일 전 예고 없이 기능과 같은 날(2026-10-23) 시행한다(사용자 결정, [decisions](decisions.md) 2026-10-23 ②). 회원이 생긴 뒤의 변경은 제13조대로 7일 전에 예고한다.

## 6. 화면(`/goal`)

와이어프레임 `scr-goal`을 바탕으로 넓힌다. 토큰·공통 클래스만 쓴다.

- 비로그인: 무엇을 하는 화면인지 + [로그인하고 목표 세우기].
- 목표 없음: 입력 카드 — 종류 칩 6개, 이름(종류를 고르면 이름 기본값), 금액, 기한(월), 앱 연동이 없거나 `available`이 아니면 "지금 모은 돈"·"매달 모을 수 있는 돈"(선택)과 [앱 연동하면 자동으로 채워져요 → /me].
- 목표 있음:
  - 진행 카드: 목표 이름·종류, `current / amount`, 진행 막대(`ratioBp`), 남은 금액, 상태 배지(REACHED 목표에 닿았어요 / ON_TRACK 기한 안에 닿아요 / BEHIND 조금 더 필요해요 / NO_PACE 저축 속도를 넣어 주세요 / OVERDUE 기한이 지났어요), "매달 ○원 남기면 돼요"(OVERDUE면 [기한 새로 정하기]), 시드머니 출처(앱 값·직접 입력, 기준 시각).
  - 시나리오 카드(최대 3개).
  - AI 코치 카드: headline·summary·steps, `aiGenerated`면 "AI" 배지·아니면 "기본 안내", `stale`이면 "목표가 바뀌었어요 · 다시 만들기", [AI 안내 만들기]/[다시 만들기](오늘 남은 n/3회), 429면 "오늘 무료 횟수를 다 썼어요" + 다시 쓸 수 있는 시각 + [플러스 알아보기 → /plus], 409면 목표를 다시 읽고 안내, `notice` 고지.
  - 중간 점검표(달·금액).
  - [수정]·[삭제](확인 대화상자). 저장 실패 시 입력 보존 + [다시 시도].
- 홈 레일: 목표가 있으면 작은 목표 카드(진행 막대·매달 필요 금액·[목표 보기]), 없으면 [목표 세우기].
- 과거 계산 고지는 필요 없다(미래 산술). 대신 `notice`를 붙인다.
- 플러스 요금표(`src/data/plans.ts`)에 "AI 목표 안내: 무료 하루 3회"를 적는다. 플러스 쪽 한도는 실결제 전까지 "더 많이"로만 쓰고 숫자를 약속하지 않는다.

## 7. 분업

| 담당 | 범위 | 건드리는 파일 |
|---|---|---|
| **Codex**(옆 세션) | §2~§5 백엔드 전부 + 테스트, `backend/README.md` API·패키지 표, 설정·배포 예시 | `backend/**`, `deploy/vm/**` |
| **Claude**(이 세션) | §6 화면, 계약 문서, 결정 기록·기획 문서(04 §8 예외 포함), 개인정보처리방침, 통합 검증·리뷰·PR | `src/**`, `docs/**` |

- 같은 브랜치 `SXXNHU/feat-goal-ai`, 같은 작업 폴더. 파일이 겹치지 않으므로 서로의 파일을 고치지 않는다. 커밋은 Claude가 통합 뒤 한다(Codex는 커밋하지 않음).
- 순서: ① 이 문서 확정 → ② 백엔드·화면 동시 진행(화면은 계약대로 붙이고 백엔드 완성 전엔 타입 검사·빌드만) → ③ 백엔드 `./gradlew test` 통과 → ④ 로컬에서 키 없이 통합 확인(기본 안내 경로) → ⑤ 서로 리뷰 → ⑥ PR.
- 키를 받으면: VM 환경변수에 `OPENAI_API_KEY`를 넣기 전에 **api 컨테이너 안에서** `api.openai.com:443`에 나갈 수 있는지 확인한다(키 없이 `GET /v1/models`가 401이면 연결은 되는 것). 그다음 AI 경로만 다시 확인한다.
