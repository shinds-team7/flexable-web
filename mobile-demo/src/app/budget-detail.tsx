/** 사용 가능 금액 산출 상세 — 계산에 쓰인 항목 나열 + 항목별 수정 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useState, type ReactNode } from 'react';
import { Pressable, StyleSheet, TextInput, View } from 'react-native';

import { SubHeader } from '@/components/SubHeader';
import { Button, Card, Screen, Sheet, T } from '@/components/ui';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { fromKey, md } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

type Editing = { id: string; name: string; amount: number } | null;

export default function BudgetDetail() {
  const { summary: s, today, protectedList, setProtected } = useStore();
  const [editing, setEditing] = useState<Editing>(null);
  const [raw, setRaw] = useState('');

  const openEdit = (e: NonNullable<Editing>) => {
    setEditing(e);
    setRaw(String(e.amount));
  };
  const saveEdit = () => {
    if (!editing) return;
    const v = Number(raw.replace(/[^0-9]/g, '')) || 0;
    setProtected(protectedList.map((p) => (p.id === editing.id ? { ...p, amount: v } : p)));
    setEditing(null);
  };

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="계산 근거" fallback={demoRoutes.home} />
      <Screen>
        <Card style={{ backgroundColor: colors.brandSofter }}>
          <T size={13} color={colors.textSub}>
            {md(s.cycleStart)} ~ {md(s.cycleEnd)} 정산 주기 · 다음 수입일까지 {s.daysLeft}일 (오늘 포함)
          </T>
          <T size={26} weight="800" style={{ marginTop: 6 }}>
            오늘({DOW[today.getDay()]}) {won(s.dailyLimit)}원
          </T>
          <T size={13} color={colors.textMuted} style={{ marginTop: 4 }}>
            오늘 {won(s.todaySpent)}원 써서 {won(Math.max(0, s.todayAvailable))}원 남았어요
          </T>
        </Card>

        <Card>
          <Line label="계좌 잔액" sub="신한 쏠편한 입출금통장 · 08:30 동기화" amount={s.bankBalance} strong />
          {s.addBack > 0 && (
            <Line
              label="반영 제외 · 1/N 조정"
              sub={`${s.adjusted.map((t) => t.merchant).join(', ')} — 돌려받을 돈은 생활비로 계산해요`}
              amount={s.addBack}
              sign="+"
              tone="warn"
              onPress={() => router.navigate(demoRoutes.transactions)}
            />
          )}
          <Divider />

          <Group title="미납 고정지출" total={s.unpaidFixedTotal} onEdit={() => router.push(demoRoutes.my)}>
            {s.unpaidFixed.length === 0 && <Sub text="이번 주기에 남은 고정지출이 없어요" />}
            {s.unpaidFixed.map((f) => (
              <Sub key={f.item.id + md(f.date)} text={`${f.item.name} (${md(f.date)})`} amount={f.item.amount} />
            ))}
          </Group>

          <Group title="미결제 카드 이용액" total={s.cardUnpaid}>
            <Sub text={`Mr.Life 신용 ${s.cardCount}건 · 다음 결제일 출금 예정`} amount={s.cardUnpaid} />
          </Group>

          <Group title="보호 금액 (저축·비상금)" total={s.protectedTotal}>
            {protectedList.map((p) => (
              <Sub key={p.id} text={p.name} amount={p.amount} onPress={() => openEdit(p)} editable />
            ))}
          </Group>

          <Group title="확보한 예정 지출" total={s.plannedTotal} onEdit={() => router.push(demoRoutes.schedule)}>
            {s.upcoming.length === 0 && <Sub text="등록된 예정 지출이 없어요" />}
            {s.upcoming.map((x) => (
              <Sub key={x.id} text={`${x.title} (${md(fromKey(x.date))})`} amount={x.amount} />
            ))}
          </Group>

          {s.reserveTotal > 0 && (
            <Group title="고액 지출 적립 (이번 주기분)" total={s.reserveTotal} onEdit={() => router.navigate(demoRoutes.plan)}>
              {s.planReserves.map((r) => (
                <Sub key={r.plan.id} text={`${r.plan.title} · 하루 ${won(r.daily)}원`} amount={r.total} />
              ))}
            </Group>
          )}

          <Divider />
          <Line label="남은 일반 생활비" amount={s.remainingNow} strong />
          <Line label={`+ 오늘 쓴 돈`} amount={s.todaySpent} sign="+" />
          <Line label={`× 오늘(${DOW[today.getDay()]}) 요일 비중 ${s.todayWeight}%`} sub={`남은 ${s.daysLeft}일의 요일 비중 합 ${s.weightTotal}% 중 ${s.todayWeight}%`} amount={s.dailyLimit} result />
          <T size={12} color={colors.textMuted} style={{ marginTop: 6 }}>
            단순히 {s.daysLeft}일로 똑같이 나누면 하루 {won(s.evenLimit)}원이지만, 소비 패턴에 맞춰 요일마다 다르게 배분해요.
          </T>
        </Card>

        <Card style={{ gap: 10 }}>
          <View style={{ flexDirection: 'row', gap: 6, alignItems: 'center' }}>
            <Ionicons name="information-circle" size={16} color={colors.brand} />
            <T size={14} weight="700">
              계산 원칙
            </T>
          </View>
          <Rule text="다음 수입은 실제로 입금된 뒤에 새 주기로 반영해요. 입금 예정 금액을 미리 쓰지 않아요." />
          <Rule text="소비 패턴을 분석해 요일마다 비중(%)을 다르게 배분해요. 주말처럼 많이 쓰는 요일은 더 받아요." />
          <Rule text="덜 쓴 돈과 초과한 돈은 남은 날짜 전체에 요일 비중대로 나눠서 반영해요." />
          <Rule text="예정 지출이 실제로 결제되면 확보해 둔 금액을 실제 거래로 바꿔요. 두 번 빠지지 않아요." />
          <Rule text={`AI는 금액을 '제안'만 하고, 계산은 정해진 규칙으로만 해요.`} />
        </Card>

        <T size={12} color={colors.textMuted} style={{ textAlign: 'center' }}>
          {today.getMonth() + 1}월 {today.getDate()}일 05:00 정산 기준
        </T>
      </Screen>

      <Sheet visible={!!editing} onClose={() => setEditing(null)} title={`${editing?.name ?? ''} 수정`} subtitle="바꾸면 오늘 사용 가능 금액이 바로 다시 계산돼요">
        <View style={styles.amountRow}>
          <TextInput accessibilityLabel="금액"
            value={raw ? won(Number(raw.replace(/[^0-9]/g, '')) || 0) : ''}
            onChangeText={setRaw}
            keyboardType="number-pad" inputMode="numeric"
            style={[styles.input, noOutline]}
          />
          <T size={18} weight="700">
            원
          </T>
        </View>
        <Button label="저장" onPress={saveEdit} style={{ marginTop: 20 }} />
      </Sheet>
    </View>
  );
}

function Line({
  label,
  sub,
  amount,
  sign,
  strong,
  result,
  tone,
  onPress,
}: {
  label: string;
  sub?: string;
  amount: number;
  sign?: '+' | '−';
  strong?: boolean;
  result?: boolean;
  tone?: 'warn';
  onPress?: () => void;
}) {
  const color = tone === 'warn' ? colors.warn : result ? colors.brandDark : colors.text;
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={styles.line}>
      <View style={{ flex: 1 }}>
        <T size={result ? 16 : 15} weight={strong || result ? '700' : '500'} color={result ? colors.brandDark : colors.text}>
          {label}
        </T>
        {sub && (
          <T size={12} color={colors.textMuted}>
            {sub}
          </T>
        )}
      </View>
      <T size={result ? 20 : 15} weight={strong || result ? '800' : '600'} color={color}>
        {sign ?? ''}
        {won(amount)}원
      </T>
      {onPress && <Ionicons name="chevron-forward" size={14} color={colors.textFaint} />}
    </Pressable>
  );
}

function Group({ title, total, onEdit, children }: { title: string; total: number; onEdit?: () => void; children: ReactNode }) {
  return (
    <View style={styles.group}>
      <View style={styles.line}>
        <T size={15} weight="600" style={{ flex: 1 }}>
          {title}
        </T>
        {onEdit && (
          <Pressable accessibilityRole="button" accessibilityLabel={`${title} 수정`} onPress={onEdit} hitSlop={8} style={styles.editBtn}>
            <T size={12} weight="600" color={colors.brandDark}>
              수정
            </T>
          </Pressable>
        )}
        <T size={15} weight="700" color={colors.danger}>
          −{won(total)}원
        </T>
      </View>
      <View style={styles.subs}>{children}</View>
    </View>
  );
}

function Sub({ text, amount, onPress, editable }: { text: string; amount?: number; onPress?: () => void; editable?: boolean }) {
  return (
    <Pressable accessibilityRole="button" onPress={onPress} disabled={!onPress} style={styles.sub}>
      <T size={13} color={colors.textMuted} style={{ flex: 1 }} numberOfLines={1}>
        {text}
      </T>
      {amount !== undefined && (
        <T size={13} color={colors.textSub}>
          {won(amount)}원
        </T>
      )}
      {editable && <Ionicons name="create-outline" size={14} color={colors.brandDark} />}
    </Pressable>
  );
}

function Rule({ text }: { text: string }) {
  return (
    <View style={{ flexDirection: 'row', gap: 6 }}>
      <T size={13} color={colors.textMuted}>
        ·
      </T>
      <T size={13} color={colors.textSub} style={{ flex: 1, lineHeight: 19 }}>
        {text}
      </T>
    </View>
  );
}

const Divider = () => <View style={{ height: 1, backgroundColor: colors.line, marginVertical: 8 }} />;

const styles = StyleSheet.create({
  line: { flexDirection: 'row', alignItems: 'center', gap: 8, paddingVertical: 8 },
  group: { paddingVertical: 2 },
  subs: { paddingLeft: 10, borderLeftWidth: 2, borderLeftColor: colors.line, marginLeft: 2, marginBottom: 6 },
  sub: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingVertical: 4 },
  editBtn: { paddingHorizontal: 10, minHeight: 28, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.brandSoft },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  input: {
    flex: 1,
    height: 54,
    borderRadius: 14,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 20,
    fontWeight: '700',
    textAlign: 'right',
    color: colors.text,
    fontFamily: font,
  },
});
