/** 구 주소 호환 — /m/pay?... → /m/simulations/pay?... (쿼리 유지) */
import { Redirect, useLocalSearchParams } from 'expo-router';

import { demoRoutes } from '@/demo/routes';

export default function LegacyPay() {
  const params = useLocalSearchParams();
  return <Redirect href={{ pathname: demoRoutes.simPay, params }} />;
}
