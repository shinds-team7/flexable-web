/** 계획 ↔ 실제 거래 연결 + 차액 정산 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { goBack, SubHeader } from '@/components/SubHeader';
import { Button, Card, ConfirmModal, IconCircle, Screen, SectionTitle, T } from '@/components/ui';
import { getCategory } from '@/demo/data/categories';
import { isSpend, spendOf } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { addDays, fromKey, md, toKey } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function Settle() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { scheduled, transactions, settleScheduled } = useStore();
  const plan = scheduled.find((s) => s.id === id);

  const candidates = useMemo(() => {
    if (!plan) return [];
    const d = fromKey(plan.date);
    const keys = [toKey(d), toKey(addDays(d, 1))];
    return transactions.filter((t) => isSpend(t) && keys.includes(t.date) && (!t.planId || t.planId === plan.id));
  }, [plan, transactions]);

  // AI 추천: 예상 금액과 가장 가까운 거래 1건
  const suggested = useMemo(() => {
    if (!plan || !candidates.length) return undefined;
    return [...candidates].sort((a, b) => Math.abs(-a.amount - plan.amount) - Math.abs(-b.amount - plan.amount))[0].id;
  }, [plan, candidates]);

  const [selected, setSelected] = useState<string[] | null>(null);
  const [noTx, setNoTx] = useState(false);
  const [raw, setRaw] = useState('');
  const [confirming, setConfirming] = useState(false);
  const [done, setDone] = useState<null | { memoryLabel?: string; before?: number; after?: number; actual: number }>(null);

  if (!plan) {
    return (
      <View style={{ flex: 1 }}>
        <SubHeader title="일정 정산" fallback={demoRoutes.home} />
        <Screen>
          <T color={colors.textMuted}>일정을 찾을 수 없어요</T>
        </Screen>
      </View>
    );
  }

  const sel = selected ?? (suggested ? [suggested] : []);
  const actual = noTx ? Number(raw.replace(/[^0-9]/g, '')) || 0 : candidates.filter((t) => sel.includes(t.id)).reduce((a, t) => a + spendOf(t), 0);
  const diff = plan.amount - actual;
  const d = fromKey(plan.date);

  if (done) {
    return (
      <View style={{ flex: 1 }}>
        <SubHeader title="일정 정산" fallback={demoRoutes.home} />
        <Screen>
          <Card style={{ alignItems: 'center', paddingVertical: 32, gap: 8 }}>
            <IconCircle name="checkmark" color={colors.brand} size={56} />
            <T size={20} weight="800" style={{ marginTop: 8 }}>
              정산을 마쳤어요
            </T>
            <T size={14} color={colors.textSub} style={{ textAlign: 'center', lineHeight: 21 }}>
              {diff >= 0
                ? `예상보다 ${won(diff)}원 덜 썼어요.\n남은 금액은 이후 생활비로 돌아갔어요.`
                : `예상보다 ${won(-diff)}원 더 썼어요.\n남은 날짜에 나눠서 반영했어요.`}
            </T>
            {done.memoryLabel && (
              <View style={styles.learn}>
                <Ionicons name="sparkles" size={14} color={colors.brandDark} />
                <T size={13} color={colors.brandDark} style={{ flex: 1 }}>
                  AI 메모리 업데이트 · {done.memoryLabel} 평균 {won(done.before ?? 0)}원 → {won(done.after ?? 0)}원
                </T>
              </View>
            )}
          </Card>
          <Button label="홈으로" onPress={() => router.dismissTo(demoRoutes.home)} />
          <Button label="AI 메모리 보기" variant="soft" onPress={() => router.replace(demoRoutes.memory)} />
        </Screen>
      </View>
    );
  }

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="일정 정산" fallback={demoRoutes.home} />
      <Screen>
        <Card>
          <T size={13} color={colors.textMuted}>
            {md(d)} ({DOW[d.getDay()]}) 예정 지출
          </T>
          <T size={20} weight="800" style={{ marginTop: 4 }}>
            {plan.title}
          </T>
          <T size={14} color={colors.textSub} style={{ marginTop: 4 }}>
            확보해 둔 금액 {won(plan.amount)}원
          </T>
        </Card>

        <Card>
          <SectionTitle title="이 일정에 쓴 결제를 골라 주세요" />
          {suggested && selected === null && !noTx && (
            <View style={styles.aiHint}>
              <Ionicons name="sparkles" size={13} color={colors.brandDark} />
              <T size={12} color={colors.brandDark}>
                AI가 금액과 시간이 가장 비슷한 결제를 골라뒀어요
              </T>
            </View>
          )}
          <View style={{ gap: 6 }}>
            {candidates.map((t) => {
              const on = !noTx && sel.includes(t.id);
              const c = getCategory(t.category);
              return (
                <Pressable
                  accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                  key={t.id}
                  onPress={() => {
                    setNoTx(false);
                    setSelected(on ? sel.filter((x) => x !== t.id) : [...sel, t.id]);
                  }}
                  style={[styles.tx, on && styles.txOn]}
                >
                  <IconCircle name={c.icon} color={c.color} size={36} />
                  <View style={{ flex: 1 }}>
                    <T size={14} weight="600">
                      {t.merchant}
                    </T>
                    <T size={12} color={colors.textMuted} numberOfLines={1}>
                      {md(fromKey(t.date))} {t.time} · {t.account}
                    </T>
                  </View>
                  <T size={14} weight="700">
                    {won(spendOf(t))}원
                  </T>
                  <Ionicons name={on ? 'checkbox' : 'square-outline'} size={20} color={on ? colors.brand : colors.placeholder} />
                </Pressable>
              );
            })}
            <Pressable accessibilityRole="checkbox" accessibilityState={{ checked: noTx }} onPress={() => setNoTx(!noTx)} style={[styles.tx, noTx && styles.txOn]}>
              <IconCircle name="cash-outline" color={colors.textSub} size={36} />
              <View style={{ flex: 1 }}>
                <T size={14} weight="600">
                  여기 없어요
                </T>
                <T size={12} color={colors.textMuted}>
                  다른 사람이 결제했거나 현금으로 냈어요
                </T>
              </View>
              <Ionicons name={noTx ? 'checkbox' : 'square-outline'} size={20} color={noTx ? colors.brand : colors.placeholder} />
            </Pressable>
          </View>
          {noTx && (
            <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8, marginTop: 12 }}>
              <TextInput accessibilityLabel="실제로 낸 금액"
                value={raw ? won(Number(raw.replace(/[^0-9]/g, '')) || 0) : ''}
                onChangeText={setRaw}
                placeholder="실제로 낸 금액 (없으면 0)"
                placeholderTextColor={colors.placeholder}
                keyboardType="number-pad" inputMode="numeric"
                style={[styles.input, noOutline]}
              />
              <T size={16} weight="600">
                원
              </T>
            </View>
          )}
        </Card>

        {/* 차액 시뮬레이션 */}
        <Card style={{ backgroundColor: diff >= 0 ? colors.brandSofter : colors.dangerSoft }}>
          <View style={styles.diffRow}>
            <T size={14} color={colors.textSub}>
              예상
            </T>
            <T size={15} weight="600">
              {won(plan.amount)}원
            </T>
          </View>
          <View style={styles.diffRow}>
            <T size={14} color={colors.textSub}>
              실제
            </T>
            <T size={15} weight="600">
              {won(actual)}원
            </T>
          </View>
          <View style={[styles.diffRow, { marginTop: 6 }]}>
            <T size={15} weight="700">
              {diff >= 0 ? '생활비로 돌아가는 돈' : '초과한 돈'}
            </T>
            <T size={20} weight="800" color={diff >= 0 ? colors.brandDark : colors.danger}>
              {won(Math.abs(diff))}원
            </T>
          </View>
        </Card>

        <Button label="정산하기" onPress={() => setConfirming(true)} disabled={!noTx && sel.length === 0} />
        <Button label="나중에 할게요" variant="ghost" onPress={() => goBack(demoRoutes.home)} />
      </Screen>

      <ConfirmModal
        visible={confirming}
        title="이대로 정산할까요?"
        message={
          diff >= 0
            ? `‘${plan.title}’에 ${won(actual)}원을 썼어요. 남은 ${won(diff)}원은 이후 하루 생활비로 나눠 드려요.`
            : `‘${plan.title}’에 예상보다 ${won(-diff)}원 더 썼어요. 남은 날짜의 하루 생활비가 조금 줄어요.`
        }
        confirmLabel="정산"
        onCancel={() => setConfirming(false)}
        onConfirm={() => {
          const r = settleScheduled(plan.id, actual, noTx ? [] : sel);
          setConfirming(false);
          setDone({ ...r, actual });
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  aiHint: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: -6, marginBottom: 10 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 10, padding: 10, borderRadius: 14, borderWidth: 1.5, borderColor: 'transparent' },
  txOn: { borderColor: colors.brand, backgroundColor: colors.brandSofter },
  input: { flex: 1, height: 50, borderRadius: 14, backgroundColor: colors.bg, paddingHorizontal: 14, fontSize: 16, textAlign: 'right', color: colors.text, fontFamily: font },
  diffRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', paddingVertical: 3 },
  learn: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandSoft, borderRadius: 12, padding: 12, marginTop: 12, alignSelf: 'stretch' },
});
