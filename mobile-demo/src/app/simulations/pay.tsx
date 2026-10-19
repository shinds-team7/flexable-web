/**
 * [시연] 결제 수신 → 오늘 쓸 수 있는 돈 재계산 → 결제 푸시
 * 실제 서비스: 카드/오픈뱅킹 거래 수신(서버) → 예산 재계산 → FCM 푸시
 * 예) /m/pay?merchant=스타벅스&amount=5600&category=cafe
 */
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { LockScreen } from '@/demo/components/LockScreen';
import { Button, T } from '@/components/ui';
import { SPEND_CATEGORIES, type CategoryId } from '@/demo/data/categories';
import { useStore } from '@/demo/store/AppStore';
import { toKey } from '@/utils/date';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function DemoPay() {
  const p = useLocalSearchParams<{ merchant?: string; amount?: string; category?: string; key?: string }>();
  const { today, summary, addTransaction, onboarded, completeOnboarding } = useStore();
  const merchant = p.merchant || '스타벅스';
  const amount = Math.abs(Number(p.amount) || 5600);
  const category = (SPEND_CATEGORIES.some((c) => c.id === p.category) ? p.category : 'etc') as CategoryId;
  const id = `demo-${merchant}-${amount}-${p.key ?? '0'}`;

  const [before] = useState(() => summary.todayAvailable);
  const [now] = useState(() => new Date());
  const applied = useRef(false);

  useEffect(() => {
    if (applied.current) return;
    applied.current = true;
    if (!onboarded) completeOnboarding();
    addTransaction({
      id,
      date: toKey(today),
      time: `${String(now.getHours()).padStart(2, '0')}:${String(now.getMinutes()).padStart(2, '0')}`,
      merchant,
      category,
      amount: -amount,
      account: 'Deep Dream 체크',
      debit: true,
    });
  }, [id, today, now, merchant, category, amount, addTransaction, onboarded, completeOnboarding]);

  const after = summary.todayAvailable;
  const over = after < 0;

  return (
    <LockScreen
      now={now}
      title={`${merchant} ${won(amount)}원 결제`}
      body={over ? `오늘 예산을 ${won(-after)}원 넘었어요. 남은 날에 나눠서 조정할게요` : `오늘 쓸 수 있는 돈 ${won(after)}원 남았어요`}
      onOpen={() => router.replace(demoRoutes.home)}
    >
      <View style={styles.box}>
        <T size={13} color="rgba(255,255,255,0.75)">
          결제 반영 전 → 후 (오늘 쓸 수 있는 돈)
        </T>
        <T size={22} weight="800" color="#fff" style={{ marginTop: 4 }}>
          {won(Math.max(0, before))}원 → {won(Math.max(0, after))}원
        </T>
      </View>
      <View style={{ flexDirection: 'row', gap: 8, marginBottom: 14 }}>
        <Button label="거래 상세" variant="soft" style={{ flex: 1 }} onPress={() => router.replace(demoRoutes.tx(id))} />
        <Button label="홈에서 확인" style={{ flex: 1 }} onPress={() => router.replace(demoRoutes.home)} />
      </View>
    </LockScreen>
  );
}

const styles = StyleSheet.create({
  box: { backgroundColor: 'rgba(0,0,0,0.25)', borderRadius: 18, padding: 16, marginBottom: 12 },
});
