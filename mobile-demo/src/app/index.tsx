/** 시연 첫 경로(/m): 시연 온보딩을 마쳤으면 실제 앱 홈, 아니면 시연 온보딩 시작 화면 */
import { Redirect } from 'expo-router';

import { useStore } from '@/demo/store/AppStore';
import { demoRoutes } from '@/demo/routes';

export default function Start() {
  const { onboarded } = useStore();
  return <Redirect href={onboarded ? demoRoutes.home : demoRoutes.onboarding} />;
}
