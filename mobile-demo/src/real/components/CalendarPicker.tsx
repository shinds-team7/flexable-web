import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Pressable, StyleSheet, View } from "react-native";
import { Modal } from "@/components/PhoneModal";
import { Button, T } from "@/real/components/ui";
import { colors, radius } from "@/real/theme";

// 기기 기본 날짜 선택기 대신 쓰는 앱 캘린더. 위는 신한 블루 띠에 고른 날짜, 아래는 흰 달력.
// value·min·max는 "YYYY-MM-DD"(서울). 날짜 계산은 UTC 자정 기준으로 해서 기기 시간대와 무관하다.
const DOW = ["일", "월", "화", "수", "목", "금", "토"];
const pad = (n: number) => String(n).padStart(2, "0");
const ymd = (y: number, m: number, d: number) => `${y}-${pad(m)}-${pad(d)}`;
function parts(value: string) {
  const [y, m, d] = value.split("-").map(Number);
  return { y, m, d };
}
const dow = (value: string) => {
  const { y, m, d } = parts(value);
  return new Date(Date.UTC(y, m - 1, d)).getUTCDay();
};
const daysIn = (y: number, m: number) =>
  new Date(Date.UTC(y, m, 0)).getUTCDate();

/** "11월 6일 (금)" */
export function calendarTitle(value: string) {
  const { m, d } = parts(value);
  return `${m}월 ${d}일 (${DOW[dow(value)]})`;
}

type Props = {
  value: string;
  /** 고를 수 있는 첫날(포함) */
  min?: string;
  /** 고를 수 있는 마지막 날(포함) */
  max?: string;
  onCancel: () => void;
  onConfirm: (value: string) => void;
};

/** 열 때마다 지금 값에서 시작하도록, 닫혀 있을 때는 그리지 않는다 */
export function CalendarPicker({
  visible,
  ...props
}: Props & { visible: boolean }) {
  return visible ? <CalendarDialog {...props} /> : null;
}

function CalendarDialog({ value, min, max, onCancel, onConfirm }: Props) {
  const [picked, setPicked] = useState(value);
  const [view, setView] = useState(() => parts(value));

  const { y, m } = view;
  const first = dow(ymd(y, m, 1));
  const total = daysIn(y, m);
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: total }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  const weeks = Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
  const out = (date: string) => (!!min && date < min) || (!!max && date > max);
  const prevMonth = m === 1 ? { y: y - 1, m: 12 } : { y, m: m - 1 };
  const nextMonth = m === 12 ? { y: y + 1, m: 1 } : { y, m: m + 1 };
  const canPrev =
    !min ||
    ymd(prevMonth.y, prevMonth.m, daysIn(prevMonth.y, prevMonth.m)) >= min;
  const canNext = !max || ymd(nextMonth.y, nextMonth.m, 1) <= max;

  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityLabel="날짜 선택 닫기"
      >
        <Pressable style={styles.dialog} onPress={() => {}} accessible={false}>
          <View style={styles.head}>
            <T size={14} weight="700" color={colors.onBrandSub} num>
              {parts(picked).y}년
            </T>
            <T
              size={26}
              weight="800"
              color={colors.onBrand}
              num
              accessibilityRole="header"
            >
              {calendarTitle(picked)}
            </T>
          </View>
          <View style={styles.body}>
            <View style={styles.nav}>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="이전 달"
                disabled={!canPrev}
                hitSlop={8}
                onPress={() => setView({ ...prevMonth, d: 1 })}
                style={styles.navBtn}
              >
                <Ionicons
                  name="chevron-back"
                  size={20}
                  color={canPrev ? colors.text : colors.textFaint}
                />
              </Pressable>
              <T size={16} weight="800" num>
                {y}년 {m}월
              </T>
              <Pressable
                accessibilityRole="button"
                accessibilityLabel="다음 달"
                disabled={!canNext}
                hitSlop={8}
                onPress={() => setView({ ...nextMonth, d: 1 })}
                style={styles.navBtn}
              >
                <Ionicons
                  name="chevron-forward"
                  size={20}
                  color={canNext ? colors.text : colors.textFaint}
                />
              </Pressable>
            </View>
            <View style={styles.row}>
              {DOW.map((d, i) => (
                <T
                  key={d}
                  size={12}
                  weight="600"
                  color={i === 0 ? colors.danger : colors.textMuted}
                  style={styles.dow}
                >
                  {d}
                </T>
              ))}
            </View>
            {weeks.map((week, w) => (
              <View key={w} style={styles.row}>
                {week.map((day, i) => {
                  if (day === null) return <View key={i} style={styles.cell} />;
                  const date = ymd(y, m, day);
                  const on = date === picked;
                  const disabled = out(date);
                  return (
                    <Pressable
                      key={i}
                      style={styles.cell}
                      accessibilityRole="button"
                      accessibilityLabel={`${m}월 ${day}일`}
                      accessibilityState={{ selected: on, disabled }}
                      disabled={disabled}
                      onPress={() => setPicked(date)}
                    >
                      <View style={[styles.day, on && styles.on]}>
                        <T
                          size={15}
                          weight={on ? "800" : "500"}
                          num
                          color={
                            on
                              ? colors.onBrand
                              : disabled
                                ? colors.textFaint
                                : i === 0
                                  ? colors.danger
                                  : colors.text
                          }
                        >
                          {day}
                        </T>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <View style={styles.actions}>
              <Button
                label="취소"
                variant="neutral"
                onPress={onCancel}
                style={{ flex: 1 }}
              />
              <Button
                label="확인"
                onPress={() => onConfirm(picked)}
                style={{ flex: 1 }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: "rgba(16, 24, 40, 0.45)",
    alignItems: "center",
    justifyContent: "center",
    padding: 20,
  },
  dialog: {
    width: "100%",
    maxWidth: 380,
    borderRadius: radius.dialog,
    overflow: "hidden",
    backgroundColor: colors.card,
  },
  head: {
    backgroundColor: colors.brand,
    paddingHorizontal: 24,
    paddingTop: 22,
    paddingBottom: 18,
    gap: 4,
  },
  body: { padding: 16, gap: 4 },
  nav: {
    flexDirection: "row",
    alignItems: "center",
    justifyContent: "space-between",
    paddingBottom: 6,
  },
  navBtn: { padding: 8 },
  row: { flexDirection: "row" },
  dow: { flex: 1, textAlign: "center", paddingVertical: 4 },
  cell: { flex: 1, alignItems: "center", paddingVertical: 2 },
  day: {
    width: 38,
    height: 38,
    borderRadius: 19,
    alignItems: "center",
    justifyContent: "center",
  },
  on: { backgroundColor: colors.brand },
  actions: { flexDirection: "row", gap: 10, paddingTop: 10 },
});

/**
 * 매달 며칠(1~31)을 고르는 달력 창. 수입일·고정지출 날짜처럼 "매달 N일"에 쓴다. 31은 말일이다.
 * 칸 이름은 "N일", 확인은 "N일로 정하기".
 */
export function DayOfMonthPicker({
  visible,
  ...props
}: {
  visible: boolean;
  title: string;
  value: number;
  onCancel: () => void;
  onConfirm: (day: number) => void;
}) {
  return visible ? <DayOfMonthDialog {...props} /> : null;
}

function DayOfMonthDialog({
  title,
  value,
  onCancel,
  onConfirm,
}: {
  title: string;
  value: number;
  onCancel: () => void;
  onConfirm: (day: number) => void;
}) {
  const [day, setDay] = useState(value >= 1 && value <= 31 ? value : 1);
  const days = Array.from({ length: 35 }, (_, i) => (i < 31 ? i + 1 : null));
  const weeks = Array.from({ length: 5 }, (_, i) =>
    days.slice(i * 7, i * 7 + 7),
  );
  return (
    <Modal
      visible
      transparent
      animationType="fade"
      statusBarTranslucent
      onRequestClose={onCancel}
    >
      <Pressable
        style={styles.backdrop}
        onPress={onCancel}
        accessibilityLabel={`${title} 선택 닫기`}
      >
        <Pressable style={styles.dialog} onPress={() => {}} accessible={false}>
          <View style={styles.head}>
            <T size={14} weight="700" color={colors.onBrandSub}>
              {title}
            </T>
            <T
              size={26}
              weight="800"
              color={colors.onBrand}
              num
              accessibilityRole="header"
            >
              {day === 31 ? "매달 말일" : `매달 ${day}일`}
            </T>
          </View>
          <View style={styles.body}>
            {weeks.map((week, w) => (
              <View key={w} style={styles.row}>
                {week.map((d, i) => {
                  if (d === null) return <View key={i} style={styles.cell} />;
                  const on = d === day;
                  return (
                    <Pressable
                      key={i}
                      style={styles.cell}
                      accessibilityRole="button"
                      accessibilityLabel={`${d}일`}
                      accessibilityState={{ selected: on }}
                      onPress={() => setDay(d)}
                    >
                      <View style={[styles.day, on && styles.on]}>
                        <T
                          size={15}
                          weight={on ? "800" : "500"}
                          num
                          color={on ? colors.onBrand : colors.text}
                        >
                          {d}
                        </T>
                      </View>
                    </Pressable>
                  );
                })}
              </View>
            ))}
            <T size={12} color={colors.textMuted} style={{ paddingTop: 4 }}>
              31일은 매달 말일이에요. 없는 날짜는 그달 말일로 계산해요
            </T>
            <View style={styles.actions}>
              <Button
                label="취소"
                variant="neutral"
                onPress={onCancel}
                style={{ flex: 1 }}
              />
              <Button
                label={`${day}일로 정하기`}
                onPress={() => onConfirm(day)}
                style={{ flex: 2 }}
              />
            </View>
          </View>
        </Pressable>
      </Pressable>
    </Modal>
  );
}
