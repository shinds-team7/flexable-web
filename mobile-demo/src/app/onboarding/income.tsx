/** 온보딩 2 — 수입일·금액 (초기 버전은 한 달 단위 정기 수입 1개) */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OnboardingFrame } from '@/components/OnboardingFrame';
import { goBack } from '@/components/SubHeader';
import { T } from '@/components/ui';
import { DEFAULT_INCOME } from '@/demo/data/mock';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function Income() {
  const edit = !!useLocalSearchParams<{ edit?: string }>().edit;
  const { income, setIncome } = useStore();
  const [raw, setRaw] = useState(String(income.amount));
  const [day, setDay] = useState(income.payday);
  const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;

  return (
    <OnboardingFrame
      backFallback={edit ? demoRoutes.my : demoRoutes.onboarding}
      editMode={edit}
      step={2}
      title={'매달 들어오는 수입을\n확인해 주세요'}
      subtitle="수입일부터 다음 수입일 전날까지를 한 주기로 계산해요"
      disabled={amount <= 0}
      onNext={() => {
        setIncome({ amount, payday: day });
        if (edit) goBack(demoRoutes.my);
        else router.push(demoRoutes.onboardingFixed);
      }}
    >
      <View style={styles.ai}>
        <Ionicons name="sparkles" size={15} color={colors.brandDark} />
        <T size={13} color={colors.brandDark} style={{ flex: 1, lineHeight: 19 }}>
          매월 {DEFAULT_INCOME.payday}일에 ‘{DEFAULT_INCOME.source}’ {won(DEFAULT_INCOME.amount)}원이 6번 들어왔어요. 맞으면 그대로 다음을 눌러 주세요
        </T>
      </View>

      <T size={13} weight="600" color={colors.textSub}>
        월 수입 (실수령액)
      </T>
      <View style={styles.amountBox}>
        <TextInput accessibilityLabel="월 수입" value={amount ? won(amount) : ''} onChangeText={setRaw} keyboardType="number-pad" inputMode="numeric" style={[styles.amount, noOutline]} />
        <T size={22} weight="700">
          원
        </T>
      </View>

      <T size={13} weight="600" color={colors.textSub} style={{ marginTop: 10 }}>
        수입일
      </T>
      <View style={styles.cal}>
        <T size={15} weight="800" style={{ textAlign: 'center', marginBottom: 10 }}>
          매월 {day}일
        </T>
        <View style={styles.grid}>
          {Array.from({ length: 31 }, (_, i) => i + 1).map((d) => {
            const on = d === day;
            return (
              <View key={d} style={styles.cell}>
                <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} accessibilityLabel={`매월 ${d}일`} hitSlop={2} onPress={() => setDay(d)} style={[styles.dayBtn, on && styles.dayOn]}>
                  <T size={15} weight={on ? '800' : '500'} color={on ? '#fff' : colors.text}>
                    {d}
                  </T>
                </Pressable>
              </View>
            );
          })}
        </View>
        {day >= 29 && (
          <T size={12} color={colors.textMuted} style={{ textAlign: 'center', marginTop: 8 }}>
            {day}일이 없는 달은 그 달 마지막 날을 수입일로 계산해요
          </T>
        )}
      </View>
      <T size={12} color={colors.textMuted}>
        부수입·용돈 같은 추가 수입은 이후 버전에서 지원할 예정이에요
      </T>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  ai: { flexDirection: 'row', gap: 6, backgroundColor: colors.brandSofter, borderRadius: 14, padding: 14, marginBottom: 10 },
  amountBox: { flexDirection: 'row', alignItems: 'center', borderBottomWidth: 2, borderBottomColor: colors.brand, paddingBottom: 6, gap: 6 },
  amount: { flex: 1, fontSize: 30, fontWeight: '800', color: colors.text, fontFamily: font, minWidth: 0 },
  cal: { backgroundColor: colors.bg, borderRadius: 18, padding: 14 },
  grid: { flexDirection: 'row', flexWrap: 'wrap' },
  cell: { width: `${100 / 7}%`, alignItems: 'center', paddingVertical: 3 },
  dayBtn: { width: 40, height: 40, borderRadius: 20, alignItems: 'center', justifyContent: 'center' },
  dayOn: { backgroundColor: colors.brand },
});
