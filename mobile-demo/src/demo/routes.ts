/**
 * 시연 경로 — 시연 앱은 사이트의 /m 아래에 배포된다(app.json experiments.baseUrl). 경로는 /m을 뺀 앱 안 경로다.
 * 화면 이동은 이 helper로 한다(경로를 한곳에서 관리).
 */
const BASE = '';
const seg = (id: string) => encodeURIComponent(id);

export const demoRoutes = {
  home: '/',
  home2: `${BASE}/home2`,
  plan: `${BASE}/plan`,
  analysis: `${BASE}/analysis`,
  transactions: `${BASE}/transactions`,
  my: `${BASE}/my`,
  budgetDetail: `${BASE}/budget-detail`,
  notifications: `${BASE}/notifications`,
  memory: `${BASE}/memory`,
  schedule: `${BASE}/schedule`,
  scheduleNew: `${BASE}/schedule/new`,
  tx: (id: string) => `${BASE}/tx/${seg(id)}`,
  settle: (id: string) => `${BASE}/settle/${seg(id)}`,

  onboarding: `${BASE}/onboarding`,
  onboardingAccount: `${BASE}/onboarding/account`,
  onboardingIncome: `${BASE}/onboarding/income`,
  onboardingFixed: `${BASE}/onboarding/fixed`,
  onboardingProtect: `${BASE}/onboarding/protect`,
  onboardingAnalyze: `${BASE}/onboarding/analyze`,

  simulations: `${BASE}/simulations`,
  simPay: `${BASE}/simulations/pay`,
  simPush: `${BASE}/simulations/push`,
} as const;
