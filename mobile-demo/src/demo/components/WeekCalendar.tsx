import Ionicons from '@expo/vector-icons/Ionicons';
import { Pressable, StyleSheet, View } from 'react-native';

import { STATUS_META, type WeekStatus } from '@/demo/store/budget';
import { colors } from '@/theme';
import { addDays, endOfMonth, isSameDay, startOfMonth, startOfWeek, toKey, weekLabel } from '@/utils/date';
import { T } from '@/components/ui';

const HEAD = ['월', '화', '수', '목', '금', '토', '일'];
const LEGEND: WeekStatus[] = ['relax', 'fine', 'tight', 'danger'];

type Props = {
  today: Date;
  selectedWeek: Date;
  /** 선택한 주의 추천 정도 — 이 주에만 색을 칠한다 (처음엔 AI 추천 주 = 초록) */
  selectedStatus: WeekStatus;
  isRecommended: boolean;
  onPrev: () => void;
  onNext: () => void;
  canPrev: boolean;
  onSelectWeek: (ws: Date) => void;
  marks: Set<string>; // 일정/계획이 있는 날짜 key
};

export function WeekCalendar({ today, selectedWeek, selectedStatus, isRecommended, onPrev, onNext, canPrev, onSelectWeek, marks }: Props) {
  // 선택 주의 목요일이 속한 달을 보여준다
  const anchor = addDays(selectedWeek, 3);
  const first = startOfWeek(startOfMonth(anchor));
  const last = endOfMonth(anchor);
  const weeks: Date[] = [];
  for (let w = first; w <= last; w = addDays(w, 7)) weeks.push(w);

  const minWeek = startOfWeek(today);
  const meta = STATUS_META[selectedStatus];

  return (
    <View>
      <View style={styles.header}>
        <View>
          <T size={18} weight="800">
            {anchor.getFullYear()}년 {anchor.getMonth() + 1}월
          </T>
          <View style={{ flexDirection: 'row', alignItems: 'center', gap: 6, marginTop: 3 }}>
            <T size={13} weight="600" color={colors.textMuted}>
              {weekLabel(selectedWeek)}
            </T>
            <View style={[styles.pill, { backgroundColor: meta.fill }]}>
              <T size={11} weight="800" color={meta.color}>
                {isRecommended ? 'AI 추천' : meta.label}
              </T>
            </View>
          </View>
        </View>
        <View style={styles.arrows}>
          <Pressable accessibilityRole="button" accessibilityLabel="이전 달" accessibilityState={{ disabled: !canPrev }} hitSlop={4} onPress={onPrev} disabled={!canPrev} style={[styles.arrow, !canPrev && { opacity: 0.35 }]}>
            <Ionicons name="chevron-back" size={18} color={colors.text} />
          </Pressable>
          <Pressable accessibilityRole="button" accessibilityLabel="다음 달" hitSlop={4} onPress={onNext} style={styles.arrow}>
            <Ionicons name="chevron-forward" size={18} color={colors.text} />
          </Pressable>
        </View>
      </View>

      <View style={styles.row}>
        {HEAD.map((h, i) => (
          <View key={h} style={styles.cell}>
            <T size={12} weight="600" color={i === 6 ? colors.danger : i === 5 ? colors.info : colors.textMuted}>
              {h}
            </T>
          </View>
        ))}
      </View>

      {weeks.map((ws) => {
        const isSel = isSameDay(ws, selectedWeek);
        const past = ws < minWeek;
        return (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={`${weekLabel(ws)}${isSel ? `, ${meta.label}` : ""}`}
            accessibilityState={{ selected: isSel, disabled: past }}
            key={toKey(ws)}
            disabled={past}
            onPress={() => onSelectWeek(ws)}
            style={[styles.row, styles.week, isSel && { backgroundColor: meta.fill }]}
          >
            {Array.from({ length: 7 }, (_, i) => {
              const d = addDays(ws, i);
              const inMonth = d.getMonth() === anchor.getMonth();
              const isToday = isSameDay(d, today);
              const dim = !inMonth || d < today;
              return (
                <View key={i} style={styles.cell}>
                  <View style={[styles.dayCircle, isToday && styles.todayCircle]}>
                    <T
                      size={14}
                      weight={isToday || isSel ? '700' : '500'}
                      color={isToday ? '#fff' : isSel ? meta.color : dim ? colors.textFaint : colors.text}
                    >
                      {d.getDate()}
                    </T>
                  </View>
                  <View style={[styles.dot, marks.has(toKey(d)) && { backgroundColor: colors.textMuted }]} />
                </View>
              );
            })}
          </Pressable>
        );
      })}

      <View style={styles.legend}>
        {LEGEND.map((k) => (
          <View key={k} style={styles.legendItem}>
            <View style={[styles.legendBox, { backgroundColor: STATUS_META[k].fill }]} />
            <T size={12} color={colors.textMuted}>
              {STATUS_META[k].label}
            </T>
          </View>
        ))}
      </View>
      <T size={11} color={colors.textMuted} style={{ textAlign: 'center', marginTop: 6 }}>
        다른 주를 누르면 그 주의 추천 정도를 색으로 보여줘요
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  header: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 },
  pill: { paddingHorizontal: 7, paddingVertical: 2, borderRadius: 999 },
  arrows: { flexDirection: 'row', gap: 8 },
  arrow: { width: 36, height: 36, borderRadius: 18, backgroundColor: colors.bg, alignItems: 'center', justifyContent: 'center' },
  row: { flexDirection: 'row' },
  week: { borderRadius: 14, marginVertical: 2, paddingVertical: 4 },
  cell: { flex: 1, alignItems: 'center', paddingVertical: 4 },
  dayCircle: { width: 30, height: 30, borderRadius: 15, alignItems: 'center', justifyContent: 'center' },
  todayCircle: { backgroundColor: colors.text },
  dot: { width: 5, height: 5, borderRadius: 3, marginTop: 2, backgroundColor: 'transparent' },
  legend: { flexDirection: 'row', gap: 14, marginTop: 12, justifyContent: 'center' },
  legendItem: { flexDirection: 'row', alignItems: 'center', gap: 5 },
  legendBox: { width: 14, height: 14, borderRadius: 4 },
});
