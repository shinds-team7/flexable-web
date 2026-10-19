/** 3. 소비 패턴 분석 — 이번 주/이번 달 예산 사용 현황 도넛 + 카테고리별 사용 현황 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { useLocalSearchParams } from 'expo-router';
import { useMemo, useState } from 'react';
import { StyleSheet, View } from 'react-native';

import { AnalysisTabs } from '@/demo/components/AnalysisTabs';
import { Donut } from '@/components/Donut';
import { Card, IconCircle, Screen, SectionTitle, Segment, T } from '@/components/ui';
import { SPEND_CATEGORIES } from '@/demo/data/categories';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { isSpend, spendOf } from '@/demo/store/budget';
import { addDays, cycleStart, diffDays, endOfWeek, md, startOfWeek, toKey } from '@/utils/date';
import { won } from '@/utils/format';

type Period = 'week' | 'month';

export default function Analysis() {
  const params = useLocalSearchParams<{ period?: string }>();
  const [period, setPeriod] = useState<Period>(params.period === 'week' ? 'week' : 'month');
  // 다른 화면에서 기간을 지정해 다시 들어오면 그 기간으로 맞춘다
  const [prevPeriodParam, setPrevPeriodParam] = useState(params.period);
  if (params.period !== prevPeriodParam) {
    setPrevPeriodParam(params.period);
    if (params.period === 'week' || params.period === 'month') setPeriod(params.period);
  }

  const { today, transactions, summary, income } = useStore();

  const data = useMemo(() => {
    const todayKey = toKey(today);
    const cycleDays = diffDays(summary.cycleEnd, summary.cycleStart) + 1;
    let from: Date, prevFrom: Date, prevTo: Date, budget: number, label: string;

    if (period === 'week') {
      from = startOfWeek(today);
      prevFrom = addDays(from, -7);
      prevTo = addDays(today, -7);
      budget = Math.round((summary.cycleBudget * 7) / cycleDays / 100) * 100;
      label = `${md(from)} ~ ${md(endOfWeek(today))}`;
    } else {
      from = summary.cycleStart;
      prevFrom = cycleStart(addDays(from, -1), income.payday);
      prevTo = addDays(prevFrom, diffDays(today, from));
      budget = summary.cycleBudget;
      label = `${md(from)} ~ ${md(today)} · 정산 주기 ${diffDays(today, from) + 1}일째`;
    }

    const inRange = (a: Date, b: Date) =>
      transactions.filter((t) => isSpend(t) && t.category !== 'transfer' && t.date >= toKey(a) && t.date <= toKey(b));
    const cur = inRange(from, today).filter((t) => t.date <= todayKey);
    const prev = inRange(prevFrom, prevTo);

    const cats = SPEND_CATEGORIES.map((c) => {
      const list = cur.filter((t) => t.category === c.id);
      const amount = list.reduce((a, t) => a + spendOf(t), 0);
      const prevAmount = prev.filter((t) => t.category === c.id).reduce((a, t) => a + spendOf(t), 0);
      return { ...c, amount, count: list.length, prevAmount };
    })
      .filter((c) => c.amount > 0)
      .sort((a, b) => b.amount - a.amount);

    const spent = cats.reduce((a, c) => a + c.amount, 0);
    const prevSpent = prev.reduce((a, t) => a + spendOf(t), 0);
    const rising = [...cats]
      .filter((c) => c.prevAmount > 0)
      .map((c) => ({ ...c, diff: (c.amount - c.prevAmount) / c.prevAmount }))
      .sort((a, b) => b.diff - a.diff)[0];

    // 이번 달 남은 기간 동안 현재 속도로 쓰면?
    const elapsed = period === 'month' ? diffDays(today, from) + 1 : 0;
    const projected = period === 'month' ? Math.round((spent / elapsed) * cycleDays) : 0;

    return { cats, spent, budget, prevSpent, rising, label, projected };
  }, [period, today, transactions, summary, income.payday]);

  const ratio = data.budget > 0 ? data.spent / data.budget : 0;
  const diff = data.spent - data.prevSpent;
  const prevName = period === 'week' ? '지난주' : '지난 주기';

  return (
    <Screen>
      <AnalysisTabs value="analysis" />
      <Segment
        items={[
          { key: 'week', label: '이번 주' },
          { key: 'month', label: '이번 정산 주기' },
        ]}
        value={period}
        onChange={setPeriod}
      />

      <Card style={{ alignItems: 'center' }}>
        <T size={13} color={colors.textMuted} style={{ alignSelf: 'flex-start' }}>
          {data.label}
        </T>
        <T size={20} weight="800" style={{ alignSelf: 'flex-start', marginTop: 4 }}>
          생활비의{' '}
          <T size={20} weight="800" color={ratio > 1 ? colors.danger : colors.brand}>
            {Math.round(ratio * 100)}%
          </T>
          를 썼어요
        </T>

        <View style={{ marginVertical: 24 }}>
          <Donut total={data.budget} segments={data.cats.map((c) => ({ value: c.amount, color: c.color }))}>
            <T size={13} color={colors.textMuted}>
              사용 금액
            </T>
            <T size={22} weight="800" style={{ marginTop: 2 }}>
              {won(data.spent)}원
            </T>
            <T size={12} color={colors.textMuted} style={{ marginTop: 4 }}>
              예산 {won(data.budget)}원
            </T>
          </Donut>
        </View>

        <View style={styles.statRow}>
          <View style={styles.stat}>
            <T size={12} color={colors.textMuted}>
              남은 예산
            </T>
            <T size={16} weight="700" color={data.budget - data.spent < 0 ? colors.danger : colors.text}>
              {won(data.budget - data.spent)}원
            </T>
          </View>
          <View style={styles.divider} />
          <View style={styles.stat}>
            <T size={12} color={colors.textMuted}>
              {prevName} 같은 기간 대비
            </T>
            <T size={16} weight="700" color={diff > 0 ? colors.danger : colors.info}>
              {diff > 0 ? '+' : ''}
              {won(diff)}원
            </T>
          </View>
        </View>
      </Card>

      {/* AI 인사이트 */}
      <Card style={{ gap: 12 }}>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
          <Ionicons name="sparkles" size={16} color={colors.brand} />
          <T size={15} weight="700">
            AI 소비 패턴 리포트
          </T>
        </View>
        {data.cats[0] && (
          <Insight
            icon="pie-chart"
            text={`가장 많이 쓴 곳은 ${data.cats[0].name}예요. 전체 지출의 ${Math.round((data.cats[0].amount / Math.max(1, data.spent)) * 100)}%를 차지해요.`}
          />
        )}
        {data.rising && data.rising.diff > 0.1 && (
          <Insight
            icon="trending-up"
            text={`${data.rising.name} 지출이 ${prevName}보다 ${Math.round(data.rising.diff * 100)}% 늘었어요.`}
            warn
          />
        )}
        {period === 'month' && (
          <Insight
            icon="calendar"
            text={
              data.projected > data.budget
                ? `지금 속도라면 다음 수입일 전에 생활비가 ${won(data.projected - data.budget)}원 모자라요.`
                : `지금 속도라면 다음 수입일까지 ${won(data.budget - data.projected)}원이 남아요.`
            }
            warn={data.projected > data.budget}
          />
        )}
      </Card>

      {/* 카테고리별 사용 현황 */}
      <Card>
        <SectionTitle title="카테고리별 사용 현황" />
        <View style={styles.stack}>
          {data.cats.map((c) => (
            <View key={c.id} style={{ flex: c.amount, backgroundColor: c.color }} />
          ))}
        </View>
        <View style={{ gap: 18, marginTop: 20 }}>
          {data.cats.map((c) => {
            const pct = data.spent > 0 ? (c.amount / data.spent) * 100 : 0;
            return (
              <View key={c.id} style={styles.catRow}>
                <IconCircle name={c.icon} color={c.color} size={40} />
                <View style={{ flex: 1, gap: 6 }}>
                  <View style={styles.catTop}>
                    <T size={15} weight="600">
                      {c.name}{' '}
                      <T size={12} color={colors.textMuted}>
                        {c.count}건
                      </T>
                    </T>
                    <T size={15} weight="700">
                      {won(c.amount)}원
                    </T>
                  </View>
                  <View style={styles.catBarRow}>
                    <View style={styles.catTrack}>
                      <View style={[styles.catFill, { width: `${pct}%`, backgroundColor: c.color }]} />
                    </View>
                    <T size={12} weight="700" color={colors.textSub} style={{ width: 46, textAlign: 'right' }}>
                      {pct.toFixed(1)}%
                    </T>
                  </View>
                </View>
              </View>
            );
          })}
        </View>
      </Card>
    </Screen>
  );
}

function Insight({ icon, text, warn }: { icon: 'pie-chart' | 'trending-up' | 'calendar'; text: string; warn?: boolean }) {
  return (
    <View style={[styles.insight, warn && { backgroundColor: colors.warnSoft }]}>
      <Ionicons name={icon} size={16} color={warn ? colors.warn : colors.brandDark} />
      <T size={14} color={colors.textSub} style={{ flex: 1, lineHeight: 20 }}>
        {text}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  statRow: { flexDirection: 'row', alignSelf: 'stretch', backgroundColor: colors.bg, borderRadius: 16, paddingVertical: 14 },
  stat: { flex: 1, alignItems: 'center', gap: 4 },
  divider: { width: 1, backgroundColor: '#DDE1E6' },
  insight: { flexDirection: 'row', gap: 8, backgroundColor: colors.brandSofter, borderRadius: 12, padding: 12 },
  stack: { flexDirection: 'row', height: 12, borderRadius: 6, overflow: 'hidden', gap: 2 },
  catRow: { flexDirection: 'row', alignItems: 'center', gap: 12 },
  catTop: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center' },
  catBarRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  catTrack: { flex: 1, height: 6, borderRadius: 3, backgroundColor: colors.bg, overflow: 'hidden' },
  catFill: { height: 6, borderRadius: 3 },
});
