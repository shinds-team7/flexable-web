/** 예정 지출 목록 — 수정·삭제, 정산 필요 일정, 정산 완료 기록 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { ScheduleEditSheet } from '@/demo/components/ScheduleEditSheet';
import { ScheduleRow } from '@/demo/components/ScheduleRow';
import { SubHeader } from '@/components/SubHeader';
import { AddButton, Card, Screen, SectionTitle, T } from '@/components/ui';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { fromKey, md, toKey } from '@/utils/date';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

export default function ScheduleList() {
  const { today, scheduled, summary } = useStore();
  const params = useLocalSearchParams<{ edit?: string }>();
  const [editId, setEditId] = useState<string | null>(null);
  // 알림 등에서 edit 파라미터로 들어오면 해당 일정 수정 시트를 연다
  const [prevEditParam, setPrevEditParam] = useState<string | undefined>(undefined);
  if (params.edit !== prevEditParam) {
    setPrevEditParam(params.edit);
    if (params.edit) setEditId(params.edit);
  }

  const todayKey = toKey(today);
  const ceKey = toKey(summary.cycleEnd);
  const toSettle = scheduled.filter((s) => s.status === 'planned' && s.date < todayKey);
  const inCycle = scheduled.filter((s) => s.status === 'planned' && s.date >= todayKey && s.date <= ceKey);
  const later = scheduled.filter((s) => s.status === 'planned' && s.date > ceKey);
  const settled = scheduled.filter((s) => s.status === 'settled');
  const editing = scheduled.find((s) => s.id === editId) ?? null;

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="후보 거래 (예정 지출)" fallback={demoRoutes.home} right={<Pressable accessibilityRole="button" accessibilityLabel="예정 지출 추가" onPress={() => router.push(demoRoutes.scheduleNew)} hitSlop={8}><Ionicons name="add" size={26} color={colors.text} /></Pressable>} />
      <Screen>
        {toSettle.length > 0 && (
          <Card>
            <SectionTitle title="정산이 필요해요" />
            <View style={{ gap: 8 }}>
              {toSettle.map((s) => (
                <ScheduleRow key={s.id} item={s} today={today} onPress={() => router.push(demoRoutes.settle(s.id))} />
              ))}
            </View>
          </Card>
        )}

        <Card>
          <SectionTitle
            title={`다음 수입일(${md(summary.nextPayday)})까지`}
            right={
              <T size={13} color={colors.textMuted}>
                {won(summary.plannedTotal)}원 확보
              </T>
            }
          />
          {inCycle.length === 0 && (
            <T size={14} color={colors.textMuted} style={{ textAlign: 'center', paddingVertical: 16 }}>
              예정된 소비가 없어요
            </T>
          )}
          <View style={{ gap: 8 }}>
            {inCycle.map((s) => (
              <ScheduleRow key={s.id} item={s} today={today} onEdit={() => setEditId(s.id)} />
            ))}
          </View>
          <View style={{ marginTop: 12 }}>
            <AddButton label="소비 일정 추가" onPress={() => router.push(demoRoutes.scheduleNew)} />
          </View>
        </Card>

        {later.length > 0 && (
          <Card>
            <SectionTitle title="다음 주기 이후" />
            <T size={12} color={colors.textMuted} style={{ marginTop: -8, marginBottom: 8 }}>
              다음 수입이 들어온 뒤 새 주기에 반영돼요
            </T>
            <View style={{ gap: 8 }}>
              {later.map((s) => (
                <ScheduleRow key={s.id} item={s} today={today} onEdit={() => setEditId(s.id)} />
              ))}
            </View>
          </Card>
        )}

        {settled.length > 0 && (
          <Card>
            <SectionTitle title="정산 완료" />
            <View style={{ gap: 12 }}>
              {settled.map((s) => {
                const diff = s.amount - (s.actual ?? 0);
                const d = fromKey(s.date);
                return (
                  <View key={s.id} style={styles.done}>
                    <View style={{ flex: 1 }}>
                      <T size={14} weight="600">
                        {s.title}
                      </T>
                      <T size={12} color={colors.textMuted}>
                        {md(d)} · 예상 {won(s.amount)}원 → 실제 {won(s.actual ?? 0)}원
                      </T>
                    </View>
                    <T size={13} weight="700" color={diff >= 0 ? colors.brandDark : colors.danger}>
                      {diff >= 0 ? `+${won(diff)}원 복귀` : `${won(diff)}원 초과`}
                    </T>
                  </View>
                );
              })}
            </View>
          </Card>
        )}
      </Screen>
      <ScheduleEditSheet item={editing} onClose={() => setEditId(null)} />
    </View>
  );
}

const styles = StyleSheet.create({
  done: { flexDirection: 'row', alignItems: 'center', gap: 8 },
});
