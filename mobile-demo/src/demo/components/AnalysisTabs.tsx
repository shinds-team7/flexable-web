import { router } from 'expo-router';
import { View } from 'react-native';

import { Segment } from '@/components/ui';
import { demoRoutes } from '@/demo/routes';

/** 분석 탭 상단 — 소비 분석 / 거래내역 전환 */
export function AnalysisTabs({ value }: { value: 'analysis' | 'transactions' }) {
  return (
    <View style={{ marginBottom: 4 }}>
      <Segment
        items={[
          { key: 'analysis', label: '소비 분석' },
          { key: 'transactions', label: '거래내역' },
        ]}
        value={value}
        onChange={(k) => k !== value && router.replace(k === 'analysis' ? demoRoutes.analysis : demoRoutes.transactions)}
      />
    </View>
  );
}
