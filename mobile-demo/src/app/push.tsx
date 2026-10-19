/** 구 주소 호환 — /m/push?... → /m/simulations/push?... (쿼리 유지) */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { demoRoutes } from '@/demo/routes';

export default function LegacyPush() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: demoRoutes.simPush, params }} />;
}
