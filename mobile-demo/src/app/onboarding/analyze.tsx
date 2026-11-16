/** 온보딩 5 — AI 소비 패턴 분석 → 첫 "오늘 쓸 수 있는 돈" 공개 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useState } from 'react';
import { ActivityIndicator, StyleSheet, View } from 'react-native';

import { OnboardingFrame } from '@/components/OnboardingFrame';
import { T } from '@/components/ui';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { md } from '@/utils/date';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

const STEPS = ['거래 1,284건 분류하는 중', '고정지출·수입 확인하는 중', '나의 소비 단가 학습하는 중', '오늘 쓸 수 있는 돈 계산하는 중'];

export default function Analyze() {
  const { summary, memory, insights, completeOnboarding } = useStore();
  const [step, setStep] = useState(0);
  const done = step >= STEPS.length;

  useEffect(() => {
    if (done) return;
    const t = setTimeout(() => setStep(step + 1), 650);
    return () => clearTimeout(t);
  }, [step, done]);

  return (
    <OnboardingFrame
      backFallback={demoRoutes.onboarding}
      step={5}
      title={done ? '준비 끝!' : 'AI가 6개월 소비를\n분석하고 있어요'}
      subtitle={done ? `${md(summary.cycleStart)} ~ ${md(summary.cycleEnd)} 주기 · 다음 수입일까지 ${summary.daysLeft}일` : undefined}
      cta="텅장관리 시작하기"
      disabled={!done}
      onNext={() => {
        completeOnboarding();
        router.replace(demoRoutes.home);
      }}
    >
      {!done ? (
        <View style={{ gap: 14, marginTop: 10 }}>
          {STEPS.map((s, i) => (
            <View key={s} style={styles.step}>
              {i < step ? (
                <Ionicons name="checkmark-circle" size={22} color={colors.brand} />
              ) : i === step ? (
                <ActivityIndicator color={colors.brand} />
              ) : (
                <Ionicons name="ellipse-outline" size={22} color={colors.textFaint} />
              )}
              <T size={15} weight={i === step ? '700' : '500'} color={i <= step ? colors.text : colors.textMuted}>
                {s}
              </T>
            </View>
          ))}
        </View>
      ) : (
        <>
          <View style={styles.hero}>
            <T size={14} weight="600" color="rgba(255,255,255,0.85)">
              오늘 쓸 수 있는 돈
            </T>
            <T size={40} weight="800" color="#fff" style={{ marginTop: 6 }}>
              {won(summary.dailyLimit)}원
            </T>
            <T size={13} color="rgba(255,255,255,0.9)" style={{ marginTop: 6 }}>
              고정지출 {won(summary.unpaidFixedTotal)}원 · 카드값 {won(summary.cardUnpaid)}원 · 보호 금액 {won(summary.protectedTotal)}원을 먼저 뺐어요
            </T>
          </View>

          <T size={15} weight="700" style={{ marginTop: 10 }}>
            AI가 알아낸 나의 소비
          </T>
          {memory.slice(0, 3).map((m) => (
            <View key={m.id} style={styles.mem}>
              <T size={14} style={{ flex: 1 }}>
                {m.label} 1회 평균
              </T>
              <T size={14} weight="700">
                {won(m.amount)}원
              </T>
            </View>
          ))}
          {insights.slice(0, 2).map((i) => (
            <View key={i.id} style={[styles.mem, { backgroundColor: colors.brandSofter }]}>
              <Ionicons name="sparkles" size={14} color={colors.brandDark} />
              <T size={13} color={colors.brandDark} style={{ flex: 1 }}>
                {i.text}
              </T>
            </View>
          ))}
        </>
      )}
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  step: { flexDirection: 'row', alignItems: 'center', gap: 12, height: 32 },
  hero: { backgroundColor: colors.brand, borderRadius: 22, padding: 22 },
  mem: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.bg, borderRadius: 14, padding: 14 },
});
