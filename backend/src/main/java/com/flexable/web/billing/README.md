# billing
요금제·구독·결제와 무료/유료 한도. 폐쇄망에서는 모의 결제만 쓴다.

## 지금(해커톤): 저장 없는 모의 결제

2026-10-22 결정([decisions](../../../../../../../../docs/product/decisions.md) 2026-10-22 ①). 이 패키지에는 아직 코드가 없다.

- 화면만 있다. `/plus` → `/billing/result?step=confirm&period=YEARLY|MONTHLY` → `success`·`fail`·`cancel`, 내 정보 → `step=revoke` → `revoked`. 진입점과 주소는 `src/data/billing.ts`(`BILLING_PROVIDER = 'MOCK'`, `startCheckout`, `billingPath`)
- 서버 호출·DB 표·브라우저 저장이 없다. 완료 화면의 이용 기간(오늘부터 1년·1달)은 화면에서만 계산한 날짜다. 요금제는 언제나 무료로 보인다(`src/data/plans.ts` `fetchSubscription`)
- 요금표·한도는 아직 `src/data/plans.ts`의 고정값이다. `GET /billing/plans`는 실결제 전에 만든다

## 출시 뒤: 토스페이먼츠 정기결제(빌링)로 바꾸기

토스페이먼츠 자동결제는 카드 등록(빌링 인증) → 빌링키 발급 → 결제일마다 가맹점이 직접 승인 요청하는 구조다. 결제 주기 스케줄링은 토스가 해 주지 않는다. 자동결제는 **리스크 검토와 추가 계약**이 있어야 쓸 수 있고, 정기 구독형이 아니면 제한된다([가이드](https://docs.tosspayments.com/guides/v2/billing), [카드 연동](https://docs.tosspayments.com/guides/v2/billing/integration)).

### 먼저 끝낼 것(코드보다 앞)

1. 사업자 등록, 토스페이먼츠 가맹 계약·자동결제 리스크 검토, 상업 시세 라이선스(decisions 확정 20·22). Vercel Hobby는 비상업용이라 정적 호스팅도 옮긴다(01 R10)
2. 웹 개인정보처리방침 개정: 결제 처리 위탁(토스페이먼츠), 수집 항목(구독 상태·결제 기록. 카드 번호는 토스가 받고 우리는 받지 않음), 보관 기간(전자상거래법상 대금결제·공급 기록 5년 등. 법률 확인), 탈퇴 시 처리. `src/pages/Privacy.tsx`·`docs/product/privacy-web.md`를 같은 PR에서 고치고 시행 7일 전에 고지한다
3. 환불·해지 정책(02 §5-8 "미확인")을 정하고 요금표·FAQ에 적는다

### 흐름

```text
[플러스] 시작 ─► POST /billing/checkout {period}            (인증) 서버가 customerKey 발급·저장
            ─► 결제창 requestBillingAuth (클라이언트 키)      카드 번호·유효기간·생년월일은 토스 창에서만 입력
            ─► successUrl = /billing/result?step=success&period=…  (+ customerKey, authKey)
               failUrl    = /billing/result?step=fail&period=…     (+ code, message)
결과 화면 success ─► POST /billing/subscriptions {authKey, customerKey, period}
            서버: POST /v1/billing/authorizations/issue (시크릿 키 Basic 인증) → billingKey 저장(암호화)
                  POST /v1/billing/{billingKey} 첫 결제 승인 → subscriptions·payments 기록 → {plan, period, planUntil}
매일 스케줄러 ─► 결제일이 된 구독마다 POST /v1/billing/{billingKey}, 실패는 재시도 횟수·유예 기간 뒤 FREE
해지 ─► POST /billing/subscription/cancel → 기간 끝에 FREE(cancel_at_period_end), 빌링키는 DELETE /v1/billing/{billingKey}
```

- 화면은 `src/data/billing.ts`의 `BILLING_PROVIDER`를 `'TOSS'`로 바꾸고 `startCheckout`의 TOSS 분기(결제창 열기)와 결과 화면 `success` 단계의 서버 확인 호출만 채운다. `fail` 단계는 이미 `code`·`message`를 읽는다
- `customerKey`는 회원 id·이메일처럼 짐작할 수 있는 값을 쓰지 않고 무작위 값(UUID)으로 만든다
- 시크릿 키·빌링키는 서버에만 둔다(환경 변수 `TOSS_SECRET_KEY`, 웹에는 `VITE_TOSS_CLIENT_KEY`만). 빌링키는 다시 조회할 수 없으므로 발급 응답을 바로 암호화해 저장한다
- 금액은 서버가 `GET /billing/plans` 설정값으로 정한다. 화면에서 받은 금액으로 결제하지 않는다(ADR-3)
- 표 초안은 03 §7 V12(`subscriptions`·`payments`)를 따르되 `mode=MOCK|TEST|LIVE`를 나누고, 결제 승인 요청에는 멱등 키(`orderId` UNIQUE)를 쓴다. 웹훅(결제 상태 변경)을 받으면 주문 상태를 다시 맞춘다
- 시험은 토스 테스트 키(개발자 테스트상점)로 하고, 운영 키는 계약 뒤 사람이 서버 환경 변수에 넣는다
