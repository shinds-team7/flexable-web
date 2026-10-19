/** 알림 센터 — 아침 정산 요약, 확인 요청, 일정 정산, D-day (푸시 알림과 같은 내용) */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, type Href } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import { SubHeader } from '@/components/SubHeader';
import { Card, Screen, T } from '@/components/ui';
import { spendOf } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { colors } from '@/theme';
import { diffDays, endOfWeek, fromKey, toKey } from '@/utils/date';
import { won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

type Noti = { id: string; icon: 'sunny' | 'card' | 'receipt' | 'flag' | 'sparkles'; color: string; title: string; body: string; time: string; href?: Href; unread?: boolean };

export default function Notifications() {
  const { summary: s, scheduled, plans, today, transactions, notify } = useStore();
  const list: Noti[] = [];
  const hhmm = `${String(notify.hour).padStart(2, '0')}:${String(notify.minute).padStart(2, '0')}`;

  // 결제 푸시: 결제가 들어올 때마다 오늘 남은 금액을 다시 계산해 알림
  if (notify.payment) {
    let remain = s.todayAvailable;
    transactions
      .filter((t) => t.date === toKey(today) && t.amount < 0 && spendOf(t) > 0)
      .forEach((t, i) => {
        list.push({ id: `pay-${t.id}`, icon: 'card', color: colors.text, title: `${t.merchant} ${won(spendOf(t))}원 결제`, body: `오늘 쓸 수 있는 돈 ${won(Math.max(0, remain))}원 남았어요`, time: t.time, href: demoRoutes.tx(t.id), unread: i === 0 });
        remain += spendOf(t);
      });
  }

  if (notify.morning)
    list.push({ id: 'morning', icon: 'sunny', color: colors.brand, title: `오늘은 ${won(s.dailyLimit)}원까지 쓸 수 있어요`, body: `어제 정산을 마쳤어요. 다음 수입일까지 ${s.daysLeft}일 남았어요`, time: hhmm, href: demoRoutes.budgetDetail });

  scheduled
    .filter((x) => x.status === 'planned' && x.date < toKey(today))
    .forEach((x) => list.push({ id: `settle-${x.id}`, icon: 'receipt', color: colors.info, title: `‘${x.title}’ 정산해 주세요`, body: `예상 ${won(x.amount)}원 · 실제 결제와 연결하면 남은 돈을 생활비로 돌려드려요`, time: hhmm, href: demoRoutes.settle(x.id) }));

  scheduled
    .filter((x) => x.status === 'planned' && x.source === 'calendar' && x.date >= toKey(today))
    .slice(0, 1)
    .forEach((x) => list.push({ id: `cal-${x.id}`, icon: 'sparkles', color: colors.brand, title: `캘린더 일정 ‘${x.title}’을 예산에 넣었어요`, body: `AI 예상 ${won(x.amount)}원 · 다르면 수정해 주세요`, time: '어제', href: { pathname: demoRoutes.schedule, params: { edit: x.id } } }));

  if (notify.plan)
    plans
    .filter((p) => endOfWeek(fromKey(p.weekStart)) >= today)
    .forEach((p) => list.push({ id: `plan-${p.id}`, icon: 'flag', color: colors.brandDark, title: `${p.title} D-${diffDays(fromKey(p.weekStart), today)}`, body: `${won(p.amount)}원 결제 예정 · 매일 조금씩 모으는 중이에요`, time: '어제' }));

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="알림" fallback={demoRoutes.home} />
      <Screen>
        <Card style={{ paddingVertical: 6, paddingHorizontal: 6 }}>
          {list.map((n, i) => (
            <Pressable accessibilityRole="button"
              key={n.id}
              disabled={!n.href}
              onPress={() => n.href && router.push(n.href)}
              style={[styles.row, i > 0 && styles.border, n.unread && { backgroundColor: colors.brandSofter }]}
            >
              <View style={[styles.icon, { backgroundColor: n.color + '1F' }]}>
                <Ionicons name={n.icon} size={18} color={n.color} />
              </View>
              <View style={{ flex: 1, gap: 2 }}>
                <T size={14} weight="700">
                  {n.title}
                </T>
                <T size={13} color={colors.textSub} style={{ lineHeight: 18 }}>
                  {n.body}
                </T>
                <T size={11} color={colors.textMuted}>
                  {n.time}
                </T>
              </View>
              {n.unread && <View style={styles.dot} />}
            </Pressable>
          ))}
        </Card>
        <T size={12} color={colors.textMuted} style={{ textAlign: 'center' }}>
          {notify.morning ? `매일 ${notify.hour < 12 ? '오전' : '오후'} ${notify.hour % 12 || 12}시${notify.minute ? ` ${notify.minute}분` : ''}에 정산 결과를 푸시로 보내드려요 · 마이에서 변경` : '아침 정산 알림이 꺼져 있어요 · 마이에서 변경'}
        </T>
      </Screen>
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', gap: 12, padding: 14, borderRadius: 16 },
  border: { marginTop: 2 },
  icon: { width: 36, height: 36, borderRadius: 18, alignItems: 'center', justifyContent: 'center' },
  dot: { width: 7, height: 7, borderRadius: 4, backgroundColor: colors.danger, marginTop: 6 },
});
