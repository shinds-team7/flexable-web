import Ionicons from '@expo/vector-icons/Ionicons';
import { router } from 'expo-router';
import { Pressable, StyleSheet, View } from 'react-native';

import type { ScheduledSpend } from '@/demo/store/budget';
import { useStore } from '@/demo/store/AppStore';
import { colors, pressed as pressedFx, pressTransition } from '@/theme';
import { fromKey, isSameDay } from '@/utils/date';
import { DOW, won } from '@/utils/format';
import { useToast } from '@/components/Toast';
import { T } from '@/components/ui';
import { demoRoutes } from '@/demo/routes';

/**
 * 후보 거래(예정 지출) 가로 박스.
 * 좌측: 날짜 · 일정 · AI 예상 금액 / 우측: 수정 · 삭제 버튼
 * onPress 를 주면 버튼 대신 화살표(정산 등 다른 화면으로 이동용)
 */
export function ScheduleRow({
  item,
  today,
  onPress,
  onEdit,
}: {
  item: ScheduledSpend;
  today: Date;
  onPress?: () => void;
  onEdit?: () => void;
}) {
  const { removeScheduled, restoreScheduled } = useStore();
  const toast = useToast();
  const d = fromKey(item.date);
  const sourceLabel = item.source === 'calendar' ? '캘린더 · AI 예상' : item.source === 'ai' ? 'AI 예상' : '직접 입력';

  const body = (
    <>
      <View style={styles.dateBox}>
        <T size={11} weight="600" color={colors.brandDark}>
          {isSameDay(d, today) ? '오늘' : DOW[d.getDay()]}
        </T>
        <T size={16} weight="800" color={colors.brandDark}>
          {d.getDate()}
        </T>
      </View>
      <View style={{ flex: 1, gap: 1 }}>
        <T size={13} color={colors.textSub} numberOfLines={1}>
          {item.title}
        </T>
        <T size={17} weight="800">
          {won(item.amount)}원
        </T>
        <View style={{ flexDirection: 'row', alignItems: 'center', gap: 3 }}>
          <Ionicons name={item.source === 'manual' ? 'create-outline' : 'sparkles'} size={10} color={colors.textMuted} />
          <T size={11} color={colors.textMuted}>
            {sourceLabel}
          </T>
        </View>
      </View>
    </>
  );

  if (onPress) {
    return (
      <Pressable accessibilityRole="button" style={styles.box} onPress={onPress}>
        {body}
        <Ionicons name="chevron-forward" size={18} color={colors.textMuted} />
      </Pressable>
    );
  }

  return (
    <View style={styles.box}>
      {body}
      <View style={styles.actions}>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title} 수정`}
          hitSlop={4}
          style={({ pressed }) => [styles.btn, styles.edit, pressTransition, pressed && pressedFx]}
          onPress={onEdit ?? (() => router.push({ pathname: demoRoutes.schedule, params: { edit: item.id } }))}
        >
          <T size={13} weight="700" color={colors.brandDark}>
            수정
          </T>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={`${item.title} 삭제`}
          hitSlop={4}
          style={({ pressed }) => [styles.btn, styles.del, pressTransition, pressed && pressedFx]}
          onPress={() => {
            removeScheduled(item.id);
            toast(`‘${item.title}’ 일정을 삭제했어요`, () => restoreScheduled(item));
          }}
        >
          <T size={13} weight="700" color={colors.textSub}>
            삭제
          </T>
        </Pressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  box: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
    padding: 12,
    borderRadius: 16,
    backgroundColor: colors.bg,
  },
  dateBox: {
    width: 44,
    height: 50,
    borderRadius: 12,
    backgroundColor: colors.brandSoft,
    alignItems: 'center',
    justifyContent: 'center',
  },
  actions: { flexDirection: 'row', gap: 6 },
  btn: { height: 36, paddingHorizontal: 12, borderRadius: 10, alignItems: 'center', justifyContent: 'center' },
  edit: { backgroundColor: colors.brandSoft },
  del: { backgroundColor: '#fff', borderWidth: 1, borderColor: colors.line },
});
