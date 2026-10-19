/** 4. 거래내역 — 연결된 계좌의 거래내역을 시간순(최신순)으로 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useMemo, useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';

import { AnalysisTabs } from '@/demo/components/AnalysisTabs';
import { Badge, Card, IconCircle, Screen, T } from '@/components/ui';
import { getCategory } from '@/demo/data/categories';
import type { Transaction } from '@/demo/data/mock';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { fromKey, isSameDay, addDays } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

type Filter = 'all' | 'out' | 'in';

export default function Transactions() {
  const { today, transactions } = useStore();
  const [month, setMonth] = useState(0); // 0 = 이번 달, -1 = 지난달
  const [filter, setFilter] = useState<Filter>('all');

  const base = new Date(today.getFullYear(), today.getMonth() + month, 1);
  const prefix = `${base.getFullYear()}-${String(base.getMonth() + 1).padStart(2, '0')}`;

  const { groups, totalOut, totalIn } = useMemo(() => {
    const list = transactions.filter((t) => t.date.startsWith(prefix));
    const totalOut = list.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
    const totalIn = list.filter((t) => t.amount > 0).reduce((a, t) => a + t.amount, 0);
    const shown = list.filter((t) => (filter === 'all' ? true : filter === 'out' ? t.amount < 0 : t.amount > 0));
    const map = new Map<string, Transaction[]>();
    shown.forEach((t) => map.set(t.date, [...(map.get(t.date) ?? []), t]));
    return { groups: [...map.entries()], totalOut, totalIn };
  }, [transactions, prefix, filter]);

  const dayLabel = (k: string) => {
    const d = fromKey(k);
    if (isSameDay(d, today)) return '오늘';
    if (isSameDay(d, addDays(today, -1))) return '어제';
    return `${d.getMonth() + 1}월 ${d.getDate()}일 ${DOW[d.getDay()]}요일`;
  };

  return (
    <Screen>
      <AnalysisTabs value="transactions" />

      <Card>
        <View style={styles.monthRow}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" accessibilityState={{ disabled: month === -1 }} onPress={() => setMonth(-1)} disabled={month === -1} hitSlop={10}>
            <Ionicons name="chevron-back" size={20} color={month === -1 ? colors.textFaint : colors.text} />
          </Pressable>
          <T size={17} weight="800">
            {base.getFullYear()}년 {base.getMonth() + 1}월
          </T>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" accessibilityState={{ disabled: month === 0 }} onPress={() => setMonth(0)} disabled={month === 0} hitSlop={10}>
            <Ionicons name="chevron-forward" size={20} color={month === 0 ? colors.textFaint : colors.text} />
          </Pressable>
        </View>
        <View style={styles.sumRow}>
          <View style={styles.sum}>
            <T size={12} color={colors.textMuted}>
              지출
            </T>
            <T size={18} weight="800">
              {won(totalOut)}원
            </T>
          </View>
          <View style={styles.sum}>
            <T size={12} color={colors.textMuted}>
              수입
            </T>
            <T size={18} weight="800" color={colors.info}>
              {won(totalIn)}원
            </T>
          </View>
        </View>
        <View style={styles.accounts}>
          <Ionicons name="link" size={14} color={colors.brandDark} />
          <T size={12} color={colors.textSub}>
            신한은행 · 신한카드 3곳 연결됨 · 08:30 동기화
          </T>
        </View>
      </Card>

      <View style={styles.filters}>
        {(
          [
            ['all', '전체'],
            ['out', '지출'],
            ['in', '수입'],
          ] as [Filter, string][]
        ).map(([k, l]) => (
          <Pressable accessibilityRole="tab" accessibilityState={{ selected: filter === k }} key={k} onPress={() => setFilter(k)} style={[styles.chip, filter === k && styles.chipOn]}>
            <T size={13} weight="600" color={filter === k ? '#fff' : colors.textSub}>
              {l}
            </T>
          </Pressable>
        ))}
      </View>

      <Card style={{ paddingVertical: 8 }}>
        {groups.length === 0 && (
          <T size={14} color={colors.textMuted} style={{ textAlign: 'center', paddingVertical: 24 }}>
            거래내역이 없어요
          </T>
        )}
        {groups.map(([date, list], gi) => {
          const dayOut = list.filter((t) => t.amount < 0).reduce((a, t) => a - t.amount, 0);
          return (
            <View key={date} style={[gi > 0 && styles.groupGap]}>
              <View style={styles.groupHead}>
                <T size={13} weight="700" color={colors.textSub}>
                  {dayLabel(date)}
                </T>
                {dayOut > 0 && (
                  <T size={12} color={colors.textMuted}>
                    -{won(dayOut)}원
                  </T>
                )}
              </View>
              {list.map((t) => {
                const c = getCategory(t.category);
                const income = t.amount > 0;
                const split = t.splitN && t.splitN > 1 ? t.splitN : 0;
                return (
                  <Pressable accessibilityRole="button" key={t.id} style={styles.tx} onPress={() => router.push(demoRoutes.tx(t.id))}>
                    <IconCircle name={c.icon} color={c.color} size={40} />
                    <View style={{ flex: 1, gap: 2 }}>
                      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
                        <T size={15} weight="600" numberOfLines={1} style={{ flexShrink: 1 }}>
                          {t.merchant}
                        </T>
                        {t.excluded && <Badge label="반영 제외" color={colors.textSub} bg={colors.bg} />}
                        {split > 0 && <Badge label={`1/${split}`} color={colors.info} bg={colors.infoSoft} />}
                      </View>
                      <T size={12} color={colors.textMuted} numberOfLines={1}>
                        {t.time} · {c.name}{t.memo ? `(${t.memo})` : ''} · {t.account}
                      </T>
                    </View>
                    <View style={{ alignItems: 'flex-end' }}>
                      <T
                        size={15}
                        weight="700"
                        color={income ? colors.info : t.excluded ? colors.textMuted : colors.text}
                        style={t.excluded || split ? { textDecorationLine: 'line-through' } : undefined}
                      >
                        {income ? '+' : ''}
                        {won(t.amount)}원
                      </T>
                      {split > 0 && (
                        <T size={12} weight="700" color={colors.info}>
                          내 부담 {won(Math.round(t.amount / split))}원
                        </T>
                      )}
                    </View>
                  </Pressable>
                );
              })}
            </View>
          );
        })}
      </Card>
    </Screen>
  );
}

const styles = StyleSheet.create({
  monthRow: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 18 },
  sumRow: { flexDirection: 'row', marginTop: 16, backgroundColor: colors.bg, borderRadius: 16, paddingVertical: 14 },
  sum: { flex: 1, alignItems: 'center', gap: 4 },
  accounts: { flexDirection: 'row', alignItems: 'center', gap: 5, marginTop: 12, justifyContent: 'center' },
  filters: { flexDirection: 'row', gap: 8 },
  chip: { paddingHorizontal: 16, minHeight: 36, justifyContent: 'center', borderRadius: 999, backgroundColor: '#fff' },
  chipOn: { backgroundColor: colors.brand },
  groupGap: { borderTopWidth: 1, borderTopColor: colors.line, marginTop: 6 },
  groupHead: { flexDirection: 'row', justifyContent: 'space-between', paddingTop: 14, paddingBottom: 6 },
  tx: { flexDirection: 'row', alignItems: 'center', gap: 12, paddingVertical: 10 },
});
