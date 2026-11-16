/**
 * 시연 경로 — 시연 앱은 사이트의 /m 아래에 배포된다(app.json experiments.baseUrl). 경로는 /m을 뺀 앱 안 경로다.
 * 시작 화면(/start)에서 [시작하기]는 실제 앱과 같은 예산 설정 5단계(/onboarding/*)로, [체험 데이터로 둘러보기]는 예시 데이터를 채운 홈으로 간다.
 */
/**
 * 앱 안 경로는 /m으로 시작하면 안 된다. expo-router가 운영 빌드에서 앞의 baseUrl(/m)을 잘라내 /my가 /y가 된다.
 * 그래서 앱의 /my 화면은 시연에서 /profile에 둔다.
 */
export const demoRoutes = {
  home: '/home',
  my: '/profile',
  start: '/start',
  onboarding: '/onboarding',
} as const;
