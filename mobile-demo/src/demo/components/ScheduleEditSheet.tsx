import { useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, TextInput, View } from 'react-native';

import type { ScheduledSpend } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { colors, font, noOutline } from '@/theme';
import { addDays, fromKey, isSameDay, toKey } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { useToast } from '@/components/Toast';
import { Button, Sheet, T } from '@/components/ui';

/** 예정 지출 수정/삭제 시트 (제목·날짜·금액) */
export function ScheduleEditSheet({ item, onClose }: { item: ScheduledSpend | null; onClose: () => void }) {
  const { today, updateScheduled, removeScheduled, restoreScheduled } = useStore();
  const toast = useToast();
  const [title, setTitle] = useState('');
  const [date, setDate] = useState(toKey(today));
  const [raw, setRaw] = useState('');

  // 다른 일정을 열면 입력값을 그 일정 값으로 채운다
  const [prevItem, setPrevItem] = useState<ScheduledSpend | null>(null);
  if (item !== prevItem) {
    setPrevItem(item);
    if (item) {
      setTitle(item.title);
      setDate(item.date);
      setRaw(String(item.amount));
    }
  }

  const days = useMemo(() => Array.from({ length: 28 }, (_, i) => addDays(today, i)), [today]);
  const amount = Number(raw.replace(/[^0-9]/g, '')) || 0;

  const save = () => {
    if (!item) return;
    const changed = amount !== item.amount;
    updateScheduled(item.id, {
      title: title.trim() || item.title,
      date,
      amount,
      dateGuessed: false,
      source: changed && item.source !== 'manual' ? item.source : item.source,
      items: changed ? [{ label: title.trim() || item.title, amount, basis: '내가 직접 수정한 금액' }] : item.items,
    });
    onClose();
  };

  return (
    <Sheet visible={!!item} onClose={onClose} title="예정 지출 수정" subtitle="AI 예상과 다르면 직접 고쳐 주세요. 저장하면 바로 다시 계산돼요">
      <T size={13} weight="600" color={colors.textSub} style={styles.label}>
        무엇을
      </T>
      <TextInput accessibilityLabel="무엇을" value={title} onChangeText={setTitle} style={[styles.input, noOutline]} />

      <T size={13} weight="600" color={colors.textSub} style={styles.label}>
        언제
      </T>
      <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: 8 }}>
        {days.map((d) => {
          const on = toKey(d) === date;
          return (
            <Pressable accessibilityRole="radio" accessibilityState={{ selected: on }} key={toKey(d)} onPress={() => setDate(toKey(d))} style={[styles.day, on && styles.dayOn]}>
              <T size={11} color={on ? '#fff' : colors.textMuted}>
                {isSameDay(d, today) ? '오늘' : DOW[d.getDay()]}
              </T>
              <T size={15} weight="700" color={on ? '#fff' : colors.text}>
                {d.getDate()}
              </T>
            </Pressable>
          );
        })}
      </ScrollView>
      <T size={12} color={colors.textMuted} style={{ marginTop: 6 }}>
        {fromKey(date).getMonth() + 1}월 {fromKey(date).getDate()}일 ({DOW[fromKey(date).getDay()]})
      </T>

      <T size={13} weight="600" color={colors.textSub} style={styles.label}>
        예상 금액 (본인 부담)
      </T>
      <View style={styles.amountRow}>
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

      <View style={{ flexDirection: 'row', gap: 8, marginTop: 24 }}>
        <Button
          label="일정 삭제"
          variant="soft"
          style={{ flex: 1 }}
          onPress={() => {
            if (item) {
              removeScheduled(item.id);
              toast(`‘${item.title}’ 일정을 삭제했어요`, () => restoreScheduled(item));
            }
            onClose();
          }}
        />
        <Button label="저장" style={{ flex: 2 }} onPress={save} disabled={amount <= 0} />
      </View>
    </Sheet>
  );
}

const styles = StyleSheet.create({
  label: { marginTop: 14, marginBottom: 8 },
  input: {
    height: 50,
    borderRadius: 14,
    backgroundColor: colors.bg,
    paddingHorizontal: 14,
    fontSize: 16,
    color: colors.text,
    fontFamily: font,
  },
  amountRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
  day: { width: 46, height: 56, borderRadius: 14, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center', gap: 2 },
  dayOn: { backgroundColor: colors.brand },
});
