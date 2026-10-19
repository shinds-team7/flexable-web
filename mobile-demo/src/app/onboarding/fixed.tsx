/** 온보딩 3 — 고정지출 (AI가 6개월 내역에서 찾은 반복 지출 + 직접 추가) */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { OnboardingFrame } from '@/components/OnboardingFrame';
import { goBack } from '@/components/SubHeader';
import { T } from '@/components/ui';
import { DEFAULT_FIXED, type FixedExpense } from '@/demo/data/mock';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function Fixed() {
  const edit = !!useLocalSearchParams<{ edit?: string }>().edit;
  const { fixed, setFixed } = useStore();
  const [list, setList] = useState<(FixedExpense & { on: boolean })[]>(() => [
    ...fixed.map((f) => ({ ...f, on: true })),
    ...DEFAULT_FIXED.filter((d) => !fixed.some((x) => x.id === d.id)).map((f) => ({ ...f, on: false })),
  ]);
  const [name, setName] = useState('');
  const [raw, setRaw] = useState('');
  const [day, setDay] = useState('');

  const total = list.filter((f) => f.on).reduce((a, f) => a + f.amount, 0);
  const add = () => {
    const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;
    const d = Math.min(31, Math.max(1, Number(day) || 1));
    if (!name.trim() || !amount) return;
    setList([...list, { id: `f-${Date.now()}`, name: name.trim(), amount, day: d, on: true }]);
    setName('');
    setRaw('');
    setDay('');
  };

  return (
    <OnboardingFrame
      backFallback={edit ? demoRoutes.my : demoRoutes.onboarding}
      editMode={edit}
      step={3}
      title={'매달 빠져나가는\n고정지출이에요'}
      subtitle="AI가 6개월 동안 같은 날 반복된 지출을 찾았어요. 아닌 건 꺼 주세요"
      cta={`월 ${won(total)}원 · 다음`}
      onNext={() => {
        setFixed(list.filter((f) => f.on).map(({ on: _on, ...f }) => f));
        if (edit) goBack(demoRoutes.my);
        else router.push(demoRoutes.onboardingProtect);
      }}
    >
      {list.map((f) => (
        <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: f.on }} key={f.id} onPress={() => setList(list.map((x) => (x.id === f.id ? { ...x, on: !x.on } : x)))} style={[styles.row, !f.on && { opacity: 0.45 }]}>
          <View style={styles.day}>
            <T size={12} weight="700" color={colors.textSub}>
              {f.day}일
            </T>
          </View>
          <T size={15} weight="600" numberOfLines={1} style={{ flex: 1 }}>
            {f.name}
          </T>
          <T size={15} weight="700">
            {won(f.amount)}원
          </T>
          <Ionicons name={f.on ? 'checkmark-circle' : 'ellipse-outline'} size={22} color={f.on ? colors.brand : colors.placeholder} />
        </Pressable>
      ))}

      <View style={styles.addBox}>
        <T size={13} weight="600" color={colors.textSub}>
          직접 추가
        </T>
        <TextInput accessibilityLabel="고정지출 항목" value={name} onChangeText={setName} placeholder="항목 (예: 헬스장)" placeholderTextColor={colors.placeholder} style={[styles.input, noOutline]} />
        <View style={{ flexDirection: 'row', gap: 8 }}>
          <TextInput accessibilityLabel="납부일" value={day} onChangeText={setDay} placeholder="납부일" keyboardType="number-pad" inputMode="numeric" placeholderTextColor={colors.placeholder} style={[styles.input, noOutline, { width: 72 }]} />
          <TextInput accessibilityLabel="고정지출 금액"
            value={raw ? won(Number(raw.replace(/[^0-9]/g, '')) || 0) : ''}
            onChangeText={setRaw}
            placeholder="금액"
            keyboardType="number-pad" inputMode="numeric"
            placeholderTextColor={colors.placeholder}
            style={[styles.input, noOutline, { flex: 1, minWidth: 0, textAlign: 'right' }]}
          />
          <Pressable accessibilityRole="button" accessibilityLabel="고정지출 추가" onPress={add} style={styles.plus}>
            <Ionicons name="add" size={22} color="#fff" />
          </Pressable>
        </View>
      </View>
    </OnboardingFrame>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 14, borderRadius: 16, backgroundColor: colors.bg },
  day: { width: 42, height: 28, borderRadius: 8, backgroundColor: '#fff', alignItems: 'center', justifyContent: 'center' },
  addBox: { gap: 8, marginTop: 10, padding: 14, borderRadius: 16, borderWidth: 1.5, borderStyle: 'dashed', borderColor: colors.brandBorder },
  input: { height: 46, borderRadius: 12, backgroundColor: colors.bg, paddingHorizontal: 12, fontSize: 15, color: colors.text, fontFamily: font },
  plus: { width: 46, height: 46, borderRadius: 12, backgroundColor: colors.brand, alignItems: 'center', justifyContent: 'center' },
});
