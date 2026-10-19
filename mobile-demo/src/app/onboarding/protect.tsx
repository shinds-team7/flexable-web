/** 온보딩 4 — 현재 잔액 확인 + 보호 금액(저축·비상금) 설정 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OnboardingFrame } from '@/components/OnboardingFrame';
import { goBack } from '@/components/SubHeader';
import { T } from '@/components/ui';
import type { Protected } from '@/demo/data/mock';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function Protect() {
  const edit = !!useLocalSearchParams<{ edit?: string }>().edit;
  const { summary, protectedList, setProtected } = useStore();
  const [list, setList] = useState<Protected[]>(protectedList);
  const total = list.reduce((a, p) => a + p.amount, 0);

  const update = (id: string, v: string) =>
    setList(list.map((p) => (p.id === id ? { ...p, amount: Number(v.replace(/[^0-9]/g, '')) || 0 } : p)));

  return (
    <OnboardingFrame
      backFallback={edit ? demoRoutes.my : demoRoutes.onboarding}
      editMode={edit}
      step={4}
      title={'절대 건드리면 안 되는 돈을\n정해 주세요'}
      subtitle="통장에 있어도 생활비로 계산하지 않고 따로 지켜둘게요"
      onNext={() => {
        setProtected(list.filter((p) => p.amount > 0));
        if (edit) goBack(demoRoutes.my);
        else router.push(demoRoutes.onboardingAnalyze);
      }}
    >
      <View style={styles.balance}>
        <T size={13} color={colors.textMuted}>
          지금 통장 잔액 (신한 쏠편한 입출금)
        </T>
        <T size={26} weight="800" style={{ marginTop: 4 }}>
          {won(summary.bankBalance)}원
        </T>
        <T size={12} color={colors.textMuted} style={{ marginTop: 4 }}>
          이 중 {won(total)}원을 보호하고 나머지로 생활비를 계산해요
        </T>
      </View>

      {list.map((p) => (
        <View key={p.id} style={styles.row}>
          <Ionicons name="lock-closed" size={18} color={colors.brandDark} />
          <TextInput accessibilityLabel="보호 항목 이름"
            value={p.name}
            onChangeText={(v) => setList(list.map((x) => (x.id === p.id ? { ...x, name: v } : x)))}
            style={[styles.name, noOutline]}
          />
          <TextInput accessibilityLabel="보호 금액" value={p.amount ? won(p.amount) : ''} onChangeText={(v) => update(p.id, v)} placeholder="0" placeholderTextColor={colors.placeholder} keyboardType="number-pad" inputMode="numeric" style={[styles.amount, noOutline]} />
          <T size={15} weight="600">
            원
          </T>
        </View>
      ))}
      <Pressable accessibilityRole="button" style={styles.add} onPress={() => setList([...list, { id: `pr-${Date.now()}`, name: '새 보호 금액', amount: 0 }])}>
        <Ionicons name="add" size={18} color={colors.brandDark} />
        <T size={14} weight="600" color={colors.brandDark}>
          보호 금액 추가
        </T>
      </Pressable>
      <T size={12} color={colors.textMuted} style={{ lineHeight: 18 }}>
        예) 비상금, 이번 달에 추가로 모을 저축, 다음 달 등록금처럼 꼭 남겨야 하는 돈
      </T>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  balance: { backgroundColor: colors.brandSofter, borderRadius: 18, padding: 18, marginBottom: 6 },
  row: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 12, borderRadius: 16, backgroundColor: colors.bg },
  name: { flex: 1, fontSize: 15, fontWeight: '600', color: colors.text, fontFamily: font, minWidth: 0 },
  amount: { width: 100, fontSize: 16, fontWeight: '700', textAlign: 'right', color: colors.text, fontFamily: font },
  add: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 4, height: 46, borderRadius: 14, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.brandBorder },
});
