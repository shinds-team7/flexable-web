// 플러스 결제 진입점과 결과 화면(/billing/result) 주소. 해커톤은 모의 결제(MOCK)다.
// 2026-10-22 결정: 모의 결제는 서버·브라우저 어디에도 결제·구독 상태를 저장하지 않고 화면 흐름만 보여 준다(방침 개정 없이 시연).
// 토스페이먼츠 정기결제(빌링)로 바꿀 때는 BILLING_PROVIDER, startCheckout의 TOSS 분기, 결과 화면의 success 처리만 채운다.
// 토스 결제창의 successUrl·failUrl은 이 파일의 billingPath('success'|'fail')로 돌아오게 해 결과 화면을 그대로 쓴다.
// 전환 순서·API 계약 초안은 backend/src/main/java/com/flexable/web/billing/README.md.
import { todayKst } from '@/lib/deadline';
import type { Period } from './plans';

export type BillingProvider = 'MOCK' | 'TOSS';
export const BILLING_PROVIDER: BillingProvider = 'MOCK';

/** 결과 화면 단계. confirm(결제 전 확인) → success | fail | cancel, 해지는 revoke(확인) → revoked */
export type BillingStep = 'confirm' | 'success' | 'fail' | 'cancel' | 'revoke' | 'revoked';
const STEPS: BillingStep[] = ['confirm', 'success', 'fail', 'cancel', 'revoke', 'revoked'];

export const billingPath = (step: BillingStep, period?: Period | null) => {
  const q = new URLSearchParams({ step });
  if (period) q.set('period', period);
  return `/billing/result?${q}`;
};

export type BillingView = {
  step: BillingStep;
  period: Period | null;
  /** 실패 사유. 토스 failUrl은 code·message를 붙여 돌아온다. 모의 결제에는 없다 */
  failCode: string | null;
  failMessage: string | null;
};

export function readBillingView(sp: URLSearchParams): BillingView {
  const step = sp.get('step');
  const period = sp.get('period');
  return {
    step: STEPS.includes(step as BillingStep) ? (step as BillingStep) : 'confirm',
    period: period === 'YEARLY' || period === 'MONTHLY' ? period : null,
    failCode: sp.get('code'),
    failMessage: sp.get('message'),
  };
}

/** 요금표의 [시작] 버튼. MOCK은 결제 전 확인 화면으로 보낸다. */
export function startCheckout(period: Period, go: (path: string) => void) {
  if (BILLING_PROVIDER === 'MOCK') {
    go(billingPath('confirm', period));
    return;
  }
  // TOSS: 서버(POST /billing/checkout)에서 customerKey를 받아 결제창 requestBillingAuth를 연다.
  // successUrl·failUrl = location.origin + billingPath('success' | 'fail', period). 서버 연결 전에는 막아 둔다.
  throw new Error('토스페이먼츠 정기결제는 아직 연결하지 않았어요');
}

/** 모의 결제 완료 화면의 이용 기간 끝(오늘부터 1년·1달). 달 끝(1월 31일 + 1달 등)은 그 달 마지막 날로 맞춘다. */
export function mockPlanUntil(period: Period, today = todayKst()): string {
  const [y, m, d] = today.split('-').map(Number);
  const ty = period === 'YEARLY' ? y + 1 : m === 12 ? y + 1 : y;
  const tm = period === 'YEARLY' ? m : m === 12 ? 1 : m + 1;
  const last = new Date(Date.UTC(ty, tm, 0)).getUTCDate();
  return `${ty}-${String(tm).padStart(2, '0')}-${String(Math.min(d, last)).padStart(2, '0')}`;
}
