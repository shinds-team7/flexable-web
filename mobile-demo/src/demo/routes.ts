/**
 * 시연 경로 — 시연 앱은 사이트의 /m 아래에 배포된다(app.json experiments.baseUrl). 경로는 /m을 뺀 앱 안 경로다.
 * 시연 온보딩(/onboarding/*)을 마치면 실제 앱 화면(/home 등, src/app/(service))으로 이어진다.
 * 실제 앱의 예산 설정 화면(앱의 /onboarding)은 시연 온보딩과 겹치지 않게 /budget-settings에 둔다.
 */
export const demoRoutes = {
  home: '/home',
  my: '/my',
  onboarding: '/onboarding',
  onboardingAccount: '/onboarding/account',
  onboardingIncome: '/onboarding/income',
  onboardingFixed: '/onboarding/fixed',
  onboardingProtect: '/onboarding/protect',
  onboardingAnalyze: '/onboarding/analyze',
} as const;
