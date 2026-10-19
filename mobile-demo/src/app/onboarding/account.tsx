/** 온보딩 1 — 계좌 연결 (오픈뱅킹, Mock) + 6개월 거래내역 불러오기 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, View } from 'react-native';

import { OnboardingFrame } from '@/components/OnboardingFrame';
import { T } from '@/components/ui';
import { ACCOUNTS } from '@/demo/data/mock';
import { colors } from '@/theme';
import { demoRoutes } from '@/demo/routes';

const BANKS = ['신한은행', 'KB국민', '카카오뱅크', '토스뱅크', '우리은행', '하나은행', '신한카드', '삼성카드'];

export default function Account() {
  const [picked, setPicked] = useState<string[]>(['신한은행', '신한카드']);
  const [state, setState] = useState<'idle' | 'loading' | 'done'>('idle');
  const connectTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (connectTimer.current) clearTimeout(connectTimer.current);
    },
    [],
  );

  const connect = () => {
    setState('loading');
    connectTimer.current = setTimeout(() => {
      setState('done');
      connectTimer.current = null;
    }, 1600);
  };

  return (
    <OnboardingFrame
      backFallback={demoRoutes.onboarding}
      step={1}
      title={state === 'done' ? '계좌를 연결했어요' : '쓰고 있는 계좌와 카드를\n연결해 주세요'}
      subtitle={state === 'done' ? '최근 6개월 거래내역 1,284건을 불러왔어요. AI가 소비 패턴을 분석할게요' : '오픈뱅킹으로 안전하게 연결하고, 최근 6개월 거래내역을 불러와요'}
      cta={state === 'done' ? '다음' : state === 'loading' ? '연결 중…' : `${picked.length}곳 연결하기`}
      disabled={state === 'loading' || picked.length === 0}
      onNext={() => (state === 'done' ? router.push(demoRoutes.onboardingIncome) : connect())}
    >
      {state === 'idle' && (
        <View style={styles.grid}>
          {BANKS.map((b) => {
            const on = picked.includes(b);
            return (
              <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: on }} key={b} onPress={() => setPicked(on ? picked.filter((x) => x !== b) : [...picked, b])} style={[styles.bank, on && styles.bankOn]}>
                <View style={[styles.bankIcon, { backgroundColor: b.startsWith('신한') ? '#0046FF' : '#D0D5DD' }]}>
                  <Ionicons name={b.includes('카드') ? 'card' : 'business'} size={16} color="#fff" />
                </View>
                <T size={13} weight={on ? '700' : '500'} numberOfLines={1} style={{ flexShrink: 1 }}>
                  {b}
                </T>
                {on && <Ionicons name="checkmark-circle" size={18} color={colors.brand} style={{ marginLeft: 'auto' }} />}
              </Pressable>
            );
          })}
        </View>
      )}

      {state === 'loading' && (
        <View style={styles.loading}>
          <ActivityIndicator size="large" color={colors.brand} />
          <T size={15} weight="600" style={{ marginTop: 16 }}>
            오픈뱅킹 인증 중…
          </T>
          <T size={13} color={colors.textMuted} style={{ marginTop: 4 }}>
            최근 6개월 거래내역을 불러오고 있어요
          </T>
        </View>
      )}

      {state === 'done' && (
        <View style={{ gap: 10 }}>
          {ACCOUNTS.map((a) => (
            <View key={a.id} style={styles.acc}>
              <View style={[styles.bankIcon, { backgroundColor: '#0046FF' }]}>
                <Ionicons name={a.type === 'bank' ? 'business' : 'card'} size={16} color="#fff" />
              </View>
              <View style={{ flex: 1 }}>
                <T size={15} weight="600">
                  {a.bank} {a.name}
                </T>
                <T size={12} color={colors.textMuted}>
                  {a.number}
                </T>
              </View>
              <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
            </View>
          ))}
        </View>
      )}

      <View style={styles.safe}>
        <Ionicons name="shield-checkmark" size={14} color={colors.brandDark} />
        <T size={12} color={colors.textSub} style={{ flex: 1 }}>
          조회 권한만 받아요. 이체·결제는 절대 하지 않아요
        </T>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: 10 },
  bank: { width: '48%', flexDirection: 'row', alignItems: 'center', gap: 8, padding: 12, borderRadius: 16, borderWidth: 1.5, borderColor: colors.line },
  bankOn: { borderColor: colors.brand, backgroundColor: colors.brandSofter },
  bankIcon: { width: 28, height: 28, borderRadius: 14, alignItems: 'center', justifyContent: 'center' },
  loading: { alignItems: 'center', paddingVertical: 50 },
  acc: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.bg },
  safe: { flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 8 },
});
