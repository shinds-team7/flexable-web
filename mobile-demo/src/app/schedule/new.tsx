/** 예정 지출 등록 — 자연어(AI) / 캘린더 불러오기 / 직접 입력. AI 초안은 바로 예산에 반영되고 이후 수정·취소 가능 */
import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, TextInput, View } from 'react-native';

import { parsePlan, type PlanDraft } from '@/demo/ai/parsePlan';
import { ScheduleEditSheet } from '@/demo/components/ScheduleEditSheet';
import { goBack, SubHeader } from '@/components/SubHeader';
import { useToast } from '@/components/Toast';
import { Badge, Button, Card, Chip, Screen, Segment, Sheet, T } from '@/components/ui';
import { CALENDAR_EVENTS } from '@/demo/data/mock';
import { useStore } from '@/demo/store/AppStore';
import { computeBudget } from '@/demo/store/budget';
import { colors, font, noOutline } from '@/theme';
import { addDays, fromKey, isSameDay, toKey } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { demoRoutes } from '@/demo/routes';

const EXAMPLES = ['다음주 금요일 아카데미 회식', '토요일 저녁먹고 영화', '내일 미용실', '15일 친구 생일 선물 5만원'];

type Result = { id: string; draft: PlanDraft; before: number; after: number };

export default function NewSchedule() {
  const store = useStore();
  const { today, memory, budgetInput, addScheduled, removeScheduled, restoreScheduled, scheduled } = store;
  const toast = useToast();
  const [mode, setMode] = useState<'ai' | 'manual'>('ai');
  const [text, setText] = useState('');
  const [loading, setLoading] = useState(false);
  const [results, setResults] = useState<Result[]>([]);
  const [calOpen, setCalOpen] = useState(false);
  const [picked, setPicked] = useState<string[]>([]);
  const [editId, setEditId] = useState<string | null>(null);
  const registrationTimer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(
    () => () => {
      if (registrationTimer.current) clearTimeout(registrationTimer.current);
    },
    [],
  );

  const register = (inputs: { text: string; source: 'ai' | 'calendar'; date?: Date }[]) => {
    setLoading(true);
    if (registrationTimer.current) clearTimeout(registrationTimer.current);
    registrationTimer.current = setTimeout(() => {
      let simulatedScheduled = budgetInput.scheduled;
      let previousDailyLimit = computeBudget({ ...budgetInput, scheduled: simulatedScheduled }).dailyLimit;
      const out: Result[] = inputs.map((inp) => {
        const draft = parsePlan(inp.text, today, memory);
        if (inp.date) {
          draft.date = inp.date;
          draft.dateGuessed = false;
        }
        const id = addScheduled({
          title: draft.title,
          date: toKey(draft.date),
          amount: draft.total,
          items: draft.items,
          source: inp.source,
          dateGuessed: draft.dateGuessed,
        });
        simulatedScheduled = [
          ...simulatedScheduled,
          {
            id,
            title: draft.title,
            date: toKey(draft.date),
            amount: draft.total,
            items: draft.items,
            source: inp.source,
            status: 'planned',
            dateGuessed: draft.dateGuessed,
          },
        ];
        const after = computeBudget({ ...budgetInput, scheduled: simulatedScheduled }).dailyLimit;
        const result = { id, draft, before: previousDailyLimit, after };
        previousDailyLimit = after;
        return result;
      });
      setResults((prev) => [...out, ...prev]);
      setText('');
      setLoading(false);
      registrationTimer.current = null;
    }, 900);
  };

  const live = results.filter((r) => scheduled.some((s) => s.id === r.id));
  const editing = scheduled.find((s) => s.id === editId) ?? null;

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="소비 일정 추가" fallback={demoRoutes.home} />
      <Screen>
        <Segment
          items={[
            { key: 'ai', label: '말로 입력 (AI)' },
            { key: 'manual', label: '직접 입력' },
          ]}
          value={mode}
          onChange={setMode}
        />

        {mode === 'ai' ? (
          <>
            <Card>
              <T size={18} weight="800">
                어떤 소비가 예정돼 있나요?
              </T>
              <T size={13} color={colors.textMuted} style={{ marginTop: 4, lineHeight: 19 }}>
                편하게 적으면 AI가 날짜와 금액을 정리해서 바로 예산에 넣어둘게요.{'\n'}금액은 내 지난 6개월 소비를 참고해요.
              </T>
              <TextInput accessibilityLabel="예정된 소비를 말로 적기"
                value={text}
                onChangeText={setText}
                placeholder="예) 다음주 금요일 아카데미 회식"
                placeholderTextColor={colors.placeholder}
                multiline
                style={[styles.textarea, noOutline]}
              />
              <View style={styles.chips}>
                {EXAMPLES.map((e) => (
                  <Chip key={e} label={e} onPress={() => setText(e)} />
                ))}
              </View>
              <Button
                label={loading ? 'AI가 정리하는 중…' : 'AI로 등록하기'}
                icon="sparkles"
                onPress={() => register([{ text, source: 'ai' }])}
                disabled={loading || text.trim().length < 2}
                style={{ marginTop: 16 }}
              />
            </Card>

            <Card onPress={() => setCalOpen(true)} style={styles.calCard}>
              <View style={styles.calIcon}>
                <Ionicons name="calendar" size={20} color={colors.info} />
              </View>
              <View style={{ flex: 1 }}>
                <T size={15} weight="700">
                  캘린더에서 불러오기
                </T>
                <T size={12} color={colors.textMuted}>
                  구글 캘린더 일정 중 돈이 들 일정을 골라 주세요
                </T>
              </View>
              <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
            </Card>
          </>
        ) : (
          <ManualForm />
        )}

        {loading && (
          <Card style={{ flexDirection: 'row', alignItems: 'center', gap: 10 }}>
            <ActivityIndicator color={colors.brand} />
            <T size={14} color={colors.textSub}>
              지난 소비 기록에서 비슷한 일정을 찾고 있어요
            </T>
          </Card>
        )}

        {live.map((r) => (
          <ResultCard
            key={r.id}
            result={r}
            onEdit={() => setEditId(r.id)}
            onCancel={() => {
              const item = scheduled.find((x) => x.id === r.id);
              removeScheduled(r.id);
              if (item) toast(`‘${item.title}’ 등록을 취소했어요`, () => restoreScheduled(item));
            }}
          />
        ))}

        {live.length > 0 && <Button label="완료" variant="soft" onPress={() => goBack(demoRoutes.home)} />}
      </Screen>

      {/* 캘린더 불러오기 (Mock) */}
      <Sheet visible={calOpen} onClose={() => setCalOpen(false)} title="구글 캘린더 일정" subtitle="앞으로 2주 일정이에요. 소비가 생길 일정만 골라 주세요">
        <View style={{ gap: 8 }}>
          {CALENDAR_EVENTS.map((ev) => {
            const d = addDays(today, ev.offset);
            const on = picked.includes(ev.id);
            const already = scheduled.some((s) => s.title === ev.title);
            return (
              <Pressable
                accessibilityRole="checkbox" accessibilityState={{ checked: on }}
                key={ev.id}
                disabled={already}
                onPress={() => setPicked(on ? picked.filter((p) => p !== ev.id) : [...picked, ev.id])}
                style={[styles.evRow, on && { borderColor: colors.brand, backgroundColor: colors.brandSofter }, already && { opacity: 0.45 }]}
              >
                <View style={[styles.evBar, { backgroundColor: ev.color }]} />
                <View style={{ flex: 1 }}>
                  <T size={15} weight="600">
                    {ev.title}
                  </T>
                  <T size={12} color={colors.textMuted}>
                    {d.getMonth() + 1}/{d.getDate()} ({DOW[d.getDay()]}){ev.time ? ` ${ev.time}` : ''}
                    {already ? ' · 이미 등록됨' : ''}
                  </T>
                </View>
                <Ionicons name={on ? 'checkbox' : 'square-outline'} size={22} color={on ? colors.brand : colors.placeholder} />
              </Pressable>
            );
          })}
        </View>
        <Button
          label={picked.length ? `${picked.length}개 일정 AI로 등록` : '일정을 선택해 주세요'}
          disabled={!picked.length}
          style={{ marginTop: 18 }}
          onPress={() => {
            const evs = CALENDAR_EVENTS.filter((e) => picked.includes(e.id));
            register(evs.map((e) => ({ text: e.title, source: 'calendar' as const, date: addDays(today, e.offset) })));
            setPicked([]);
            setCalOpen(false);
          }}
        />
      </Sheet>

      <ScheduleEditSheet item={editing} onClose={() => setEditId(null)} />
    </View>
  );
}

function ResultCard({ result, onEdit, onCancel }: { result: Result; onEdit: () => void; onCancel: () => void }) {
  const { today, scheduled } = useStore();
  const s = scheduled.find((x) => x.id === result.id);
  if (!s) return null;
  const d = fromKey(s.date);
  const edited = s.items?.[0]?.basis === '내가 직접 수정한 금액';
  const large = result.draft.large;

  return (
    <Card style={{ gap: 12 }}>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6 }}>
        <Ionicons name="checkmark-circle" size={20} color={colors.brand} />
        <T size={15} weight="700" style={{ flex: 1 }}>
          예산에 반영했어요
        </T>
        <Badge label={s.source === 'calendar' ? '캘린더' : 'AI 초안'} color={colors.brandDark} bg={colors.brandSoft} />
      </View>

      <View style={styles.resBox}>
        <T size={17} weight="800">
          {s.title}
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 4 }}>
          <T size={13} color={colors.textSub}>
            {isSameDay(d, today) ? '오늘' : `${d.getMonth() + 1}월 ${d.getDate()}일 (${DOW[d.getDay()]})`}
          </T>
          {s.dateGuessed && <Badge label="날짜 확인 필요" color={colors.warn} bg={colors.warnSoft} />}
        </View>
        <View style={{ marginTop: 12, gap: 8 }}>
          {(s.items ?? []).map((it, i) => (
            <View key={i} style={styles.itemRow}>
              <View style={{ flex: 1 }}>
                <T size={14} weight="600">
                  {it.label}
                </T>
                <T size={12} color={colors.textMuted}>
                  {it.basis}
                </T>
              </View>
              <T size={14} weight="700">
                {won(it.amount)}원
              </T>
            </View>
          ))}
        </View>
        <View style={styles.totalRow}>
          <T size={14} weight="600" color={colors.textSub}>
            확보한 금액
          </T>
          <T size={18} weight="800">
            {won(s.amount)}원
          </T>
        </View>
      </View>

      <View style={styles.compare}>
        <T size={13} color={colors.textMuted}>
          하루 사용 가능 금액
        </T>
        <T size={15} weight="700" color={colors.textSub}>
          {won(result.before)}원
        </T>
        <Ionicons name="arrow-forward" size={14} color={colors.textFaint} />
        <T size={15} weight="800" color={colors.brandDark}>
          {won(result.after)}원
        </T>
      </View>
      <T size={12} color={colors.textMuted}>
        {edited ? '직접 수정한 금액으로 다시 계산했어요.' : 'AI 예상과 실제 금액이 다를 것 같으면 수정해 주세요. 일정 다음 날 실제 결제와 비교해 다시 학습해요.'}
      </T>

      {large && (
        <Pressable accessibilityRole="button"
          style={styles.large}
          onPress={() => {
            onCancel();
            router.navigate({ pathname: demoRoutes.plan, params: { amount: String(large.amount || s.amount), title: large.title } });
          }}
        >
          <Ionicons name="flag" size={16} color={colors.brandDark} />
          <T size={13} weight="600" color={colors.brandDark} style={{ flex: 1 }}>
            큰 지출 같아요. 결제 시기를 AI 추천으로 정해볼까요?
          </T>
          <Ionicons name="chevron-forward" size={16} color={colors.brandDark} />
        </Pressable>
      )}

      <View style={{ flexDirection: 'row', gap: 8 }}>
        <Button label="등록 취소" variant="ghost" style={{ flex: 1, height: 46 }} onPress={onCancel} />
        <Button label="수정" variant="soft" style={{ flex: 1, height: 46 }} onPress={onEdit} />
      </View>
    </Card>
  );
}

function ManualForm() {
  const { today, addScheduled } = useStore();
  const [title, setTitle] = useState('');
  const [raw, setRaw] = useState('');
  const [day, setDay] = useState(0);
  const days = useMemo(() => Array.from({ length: 21 }, (_, i) => addDays(today, i)), [today]);
  const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;
  const valid = title.trim().length > 0 && amount > 0;

  return (
    <Card>
      <T size={13} weight="600" color={colors.textSub} style={styles.label}>
        무엇을
      </T>
      <TextInput accessibilityLabel="무엇을" value={title} onChangeText={setTitle} placeholder="예) 친구 집들이" placeholderTextColor={colors.placeholder} style={[styles.input, noOutline]} />
      <T size={13} weight="600" color={colors.textSub} style={styles.label}>
        언제
      </T>
      <View style={styles.chips}>
        {days.map((d, i) => {
          const on = i === day;
          return (
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} key={i} onPress={() => setDay(i)} style={[styles.day, on && styles.dayOn]}>
              <T size={11} color={on ? '#fff' : colors.textMuted}>
                {i === 0 ? '오늘' : DOW[d.getDay()]}
              </T>
              <T size={15} weight="700" color={on ? '#fff' : colors.text}>
                {d.getDate()}
              </T>
            </Pressable>
          );
        })}
      </View>
      <T size={13} weight="600" color={colors.textSub} style={styles.label}>
        예상 금액 (본인 부담)
      </T>
      <View style={{ flexDirection: 'row', alignItems: 'center', gap: 8 }}>
        <TextInput accessibilityLabel="예상 금액"
          value={amount ? won(amount) : ''}
          onChangeText={setRaw}
          keyboardType="number-pad" inputMode="numeric"
          placeholder="0"
          placeholderTextColor={colors.placeholder}
          style={[styles.input, noOutline, { flex: 1, minWidth: 0, textAlign: 'right' }]}
        />
        <T size={16} weight="600">
          원
        </T>
      </View>
      <Button
        label="추가하기"
        disabled={!valid}
        style={{ marginTop: 20 }}
        onPress={() => {
          addScheduled({ title: title.trim(), date: toKey(days[day]), amount, source: 'manual', items: [{ label: title.trim(), amount, basis: '직접 입력한 금액' }] });
          goBack(demoRoutes.home);
        }}
      />
    </Card>
  );
}

const styles = StyleSheet.create({
  textarea: {
    marginTop: 16,
    minHeight: 90,
    borderRadius: 16,
    backgroundColor: colors.bg,
    padding: 14,
    fontSize: 16,
    lineHeight: 22,
    color: colors.text,
    fontFamily: font,
    textAlignVertical: 'top',
  },
  chips: { flexDirection: 'row', flexWrap: 'wrap', gap: 8, marginTop: 12 },
  calCard: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 16 },
  calIcon: { width: 40, height: 40, borderRadius: 12, backgroundColor: colors.infoSoft, alignItems: 'center', justifyContent: 'center' },
  evRow: { flexDirection: 'row', alignItems: 'center', gap: 12, padding: 12, borderRadius: 14, borderWidth: 1.5, borderColor: colors.line },
  evBar: { width: 4, height: 34, borderRadius: 2 },
  resBox: { backgroundColor: colors.bg, borderRadius: 16, padding: 16 },
  itemRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  totalRow: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginTop: 12, paddingTop: 12, borderTopWidth: 1, borderTopColor: '#E4E7EC' },
  compare: { flexDirection: 'row', alignItems: 'center', gap: 8, backgroundColor: colors.brandSofter, borderRadius: 12, padding: 12, flexWrap: 'wrap' },
  large: { flexDirection: 'row', alignItems: 'center', gap: 6, backgroundColor: colors.brandSoft, borderRadius: 12, padding: 12 },
  label: { marginTop: 14, marginBottom: 8 },
  input: { height: 50, borderRadius: 14, backgroundColor: colors.bg, paddingHorizontal: 14, fontSize: 16, color: colors.text, fontFamily: font },
  day: { width: 44, height: 54, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayOn: { backgroundColor: colors.brand },
});
