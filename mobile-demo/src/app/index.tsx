/** 시연 첫 경로(/m): 시연을 시작했으면 실제 앱 홈(예산 설정 전이면 홈이 /onboarding으로 보낸다), 아니면 시작 화면 */
import { Redirect } from 'expo-router';

import { useStore } from '@/demo/store/AppStore';
import { demoRoutes } from '@/demo/routes';

export default function Start() {
  const { onboarded } = useStore();
  return <Redirect href={onboarded ? demoRoutes.home : demoRoutes.start} />;
}
