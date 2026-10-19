/** 2. 지출계획 — 고액 지출 금액 입력 → AI 추천 결제 주 + 1주 단위 조정 → 홈 예산에 반영 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router, useLocalSearchParams } from 'expo-router';
import { useEffect, useMemo, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { Button, Card, Screen, T } from '@/components/ui';
import { WeekCalendar } from '@/demo/components/WeekCalendar';
import { evaluateWeek, recommendWeek, STATUS_META } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { noOutline, colors, font } from '@/theme';
import { addDays, diffDays, endOfWeek, isSameDay, md, startOfWeek, toKey, weekLabel } from '@/utils/date';
import { manwon, won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

const QUICK = [
  { v: 100000, label: '+10만' },
  { v: 300000, label: '+30만' },
  { v: 500000, label: '+50만' },
  { v: 1000000, label: '+100만' },
];

export default function Plan() {
  const { today, budgetInput, scheduled, plans, addPlan } = useStore();
  const params = useLocalSearchParams<{ amount?: string; title?: string }>();
  // 지출계획 화면에선 무엇을 위한 지출인지 받지 않는다 (예정 지출 등록에서 넘어온 경우만 이름 유지)
  const title = params.title ?? '';
  const [raw, setRaw] = useState(params.amount && params.amount !== '0' ? params.amount : '');
  // 예정 지출 등록 화면에서 "큰 지출"로 넘어온 경우 값 채우기
  const [prevAmountParam, setPrevAmountParam] = useState(params.amount);
  if (params.amount !== prevAmountParam) {
    setPrevAmountParam(params.amount);
    if (params.amount && params.amount !== '0') setRaw(params.amount);
  }
  const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;

  // 금액 입력이 멈추면 AI 분석 → 캘린더 노출 (Mock 지연)
  const [analyzed, setAnalyzed] = useState(0);
  const [prevAmount, setPrevAmount] = useState(amount);
  if (amount !== prevAmount) {
    setPrevAmount(amount);
    if (amount < 10000) setAnalyzed(0);
  }
  // 분석 결과가 지금 입력한 금액을 아직 따라오지 못했으면 분석 중
  const loading = amount >= 10000 && analyzed !== amount;
  useEffect(() => {
    if (amount < 10000) return;
    const t = setTimeout(() => setAnalyzed(amount), 700);
    return () => clearTimeout(t);
  }, [amount]);

  const recommended = useMemo(
    () => (analyzed ? recommendWeek(budgetInput, analyzed) : startOfWeek(today)),
    [analyzed, budgetInput, today],
  );
  const [selected, setSelected] = useState(recommended);
  // 추천 주가 바뀌면 선택도 추천 주로 되돌린다
  const [prevRecommended, setPrevRecommended] = useState(recommended);
  if (recommended.getTime() !== prevRecommended.getTime()) {
    setPrevRecommended(recommended);
    setSelected(recommended);
  }

  const minWeek = startOfWeek(today);
  const canPrev = selected > minWeek;
  const result = analyzed ? evaluateWeek(budgetInput, analyzed, selected) : null;
  const meta = result ? STATUS_META[result.status] : null;
  const isRec = isSameDay(selected, recommended);

  const marks = useMemo(() => {
    const s = new Set<string>(scheduled.map((x) => x.date));
    plans.forEach((p) => s.add(p.weekStart));
    return s;
  }, [scheduled, plans]);

  const confirm = () => {
    if (!analyzed) return;
    addPlan({ title: title.trim() || `고액 지출 ${manwon(analyzed)}`, amount: analyzed, weekStart: toKey(selected) });
    setRaw('');
    router.navigate(demoRoutes.home);
  };

  const payDays = diffDays(endOfWeek(selected), today) + 1;

  return (
    <Screen>
      <Card>
        <T size={20} weight="800">
          큰 지출이 예정되어 있나요?
        </T>
        <T size={14} color={colors.textMuted} style={{ marginTop: 6 }}>
          금액을 알려주면 AI가 내 소비 패턴을 보고{'\n'}일상에 무리 없는 결제 시기를 추천해요
        </T>

        <View style={styles.amountBox}>
          <TextInput accessibilityLabel="큰 지출 금액"
            value={amount ? won(amount) : ''}
            onChangeText={setRaw}
            placeholder="금액 입력"
            keyboardType="number-pad" inputMode="numeric"
            placeholderTextColor={colors.placeholder}
            style={[styles.amountInput, noOutline]}
          />
          <T size={24} weight="700">
            원
          </T>
        </View>
        <View style={styles.quick}>
          {QUICK.map((q) => (
            <Pressable accessibilityRole="button" key={q.v} onPress={() => setRaw(String(amount + q.v))} style={styles.quickChip}>
              <T size={13} weight="600" color={colors.textSub}>
                {q.label}
              </T>
            </Pressable>
          ))}
          {amount > 0 && (
            <Pressable accessibilityRole="button" onPress={() => setRaw('')} style={styles.quickChip}>
              <T size={13} weight="600" color={colors.textMuted}>
                초기화
              </T>
            </Pressable>
          )}
        </View>
      </Card>

      {loading && (
        <Card style={styles.loading}>
          <ActivityIndicator color={colors.brand} />
          <T size={14} color={colors.textSub}>
            AI가 최근 3개월 소비 패턴을 분석하고 있어요
          </T>
        </Card>
      )}

      {!loading && analyzed > 0 && result && meta && (
        <>
          <Card>
            <WeekCalendar
              today={today}
              selectedWeek={selected}
              selectedStatus={result.status}
              isRecommended={isRec}
              canPrev={canPrev}
              onPrev={() => canPrev && setSelected(addDays(selected, -7))}
              onNext={() => setSelected(addDays(selected, 7))}
              onSelectWeek={setSelected}
              marks={marks}
            />
          </Card>

          <Card>
            <View style={styles.aiHead}>
              <View style={styles.aiIcon}>
                <Ionicons name="sparkles" size={16} color="#fff" />
              </View>
              <T size={14} weight="700" color={colors.brandDark}>
                AI 분석 결과
              </T>
              <View style={[styles.status, { backgroundColor: meta.bg }]}>
                <T size={12} weight="800" color={meta.color}>
                  {meta.label}
                </T>
              </View>
            </View>

            <T size={18} weight="800" style={{ lineHeight: 26 }}>
              {weekLabel(selected)}({md(selected)}~{md(endOfWeek(selected))})에 결제하면{'\n'}
              <T size={18} weight="800" color={meta.color}>
                {meta.msg}
              </T>
            </T>

            <View style={styles.compare}>
              <View style={styles.compareCol}>
                <T size={12} color={colors.textMuted}>
                  지금 하루 한도
                </T>
                <T size={18} weight="700" color={colors.textSub}>
                  {won(result.before)}원
                </T>
              </View>
              <Ionicons name="arrow-forward" size={18} color={colors.textFaint} />
              <View style={styles.compareCol}>
                <T size={12} color={colors.textMuted}>
                  계획 반영 후
                </T>
                <T size={18} weight="800" color={meta.color}>
                  {won(result.after)}원
                </T>
              </View>
            </View>

            <T size={13} color={colors.textMuted} style={{ lineHeight: 20 }}>
              오늘부터 {payDays}일 동안 하루 {won(result.before - result.after)}원씩 모아{' '}
              {won(analyzed)}원을 준비해요.
              {result.sameWeekPlans > 0 ? '\n같은 주에 다른 고액 지출이 있어 부담이 겹쳐요.' : ''}
            </T>

            {!isRec && (
              <Pressable accessibilityRole="button" style={styles.recLink} onPress={() => setSelected(recommended)}>
                <Ionicons name="bulb-outline" size={16} color={colors.brandDark} />
                <T size={13} weight="600" color={colors.brandDark} style={{ flex: 1 }}>
                  AI 추천은 {weekLabel(recommended)}이에요 · 추천 주로 이동
                </T>
                <Ionicons name="chevron-forward" size={16} color={colors.brandDark} />
              </Pressable>
            )}
          </Card>

          <Button label={`${weekLabel(selected)}로 계획 확정`} onPress={confirm} icon="checkmark-circle" />
          <T size={12} color={colors.textMuted} style={{ textAlign: 'center' }}>
            확정하면 홈의 오늘 사용 가능한 금액에 바로 반영돼요
          </T>
        </>
      )}
    </Screen>
  );
}

const styles = StyleSheet.create({
  amountBox: {
    flexDirection: 'row',
    alignItems: 'center',
    borderBottomWidth: 2,
    borderBottomColor: colors.brand,
    marginTop: 24,
    paddingBottom: 6,
    gap: 6,
  },
  amountInput: {
    flex: 1,
    fontSize: 30,
    fontWeight: '800',
    color: colors.text,
    fontFamily: font,
    paddingVertical: 4,
    minWidth: 0,
  },
  quick: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 14 },
  quickChip: { paddingHorizontal: 14, minHeight: 36, justifyContent: 'center', borderRadius: 999, backgroundColor: colors.sunken },
  titleInput: {
    marginTop: 16,
    height: 48,
    borderRadius: 14,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 15,
    color: colors.text,
    fontFamily: font,
  },
  loading: { flexDirection: 'row', alignItems: 'center', gap: 10 },
  aiHead: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 12 },
  aiIcon: {
    width: 26,
    height: 26,
    borderRadius: 13,
    backgroundColor: colors.brand,
    alignItems: 'center',
    justifyContent: 'center',
  },
  status: { marginLeft: 'auto', paddingHorizontal: 10, paddingVertical: 4, borderRadius: 999 },
  compare: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-around',
    backgroundColor: colors.bg,
    borderRadius: 16,
    paddingVertical: 14,
    marginVertical: 16,
  },
  compareCol: { alignItems: 'center', gap: 4 },
  recLink: {
    marginTop: 14,
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.brandSoft,
    borderRadius: 12,
    padding: 12,
  },
});
