import { Pressable, StyleSheet, View } from "react-native";
import { Card, T } from "./ui";
import { colors, radius } from "@/real/theme";
import { won } from "@/real/utils/format";
import {
  DAYS,
  PRESET_LABEL,
  presetNote,
  type Preset,
} from "@/real/utils/dayWeights";
/** 32,400 → "3.2만". 칸이 좁아 만 원 단위로 줄이고, 금액 규칙대로 내림한다 */
function short(n: number) {
  return n >= 10000 ? `${Math.floor(n / 1000) / 10}만` : won(n);
}
/**
 * 요일별 생활비 배분. 금액은 서버가 남은 생활비를 남은 날의 요일 비중대로 나눈 값(dayBudgets)이다.
 * 오늘은 신한 블루, 지난 요일은 회색, 남은 요일은 연한 블루로 칠하고, 막대 높이는 금액에 맞춘다.
 */
export function DayBudgets({
  date,
  dayBudgets,
  preset,
  onEdit,
}: {
  /** 오늘 날짜 "YYYY-MM-DD"(서울) */
  date: string;
  /** 월~일 하루 예산 */
  dayBudgets: number[];
  preset: Preset;
  onEdit: () => void;
}) {
  // getDay() is 0 for Sunday; the row starts on Monday.
  const today = (new Date(date + "T12:00:00").getDay() + 6) % 7;
  const top = Math.max(1, ...dayBudgets);
  return (
    <Card style={{ gap: 14 }}>
      <View style={styles.head}>
        <T
          size={16}
          weight="700"
          accessibilityRole="header"
          style={{ flex: 1 }}
        >
          요일별 생활비 배분
        </T>
        <View style={styles.chip}>
          <T size={12} weight="700" color={colors.textSub}>
            {PRESET_LABEL[preset]}
          </T>
        </View>
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="요일별 배분 바꾸기"
          hitSlop={10}
          onPress={onEdit}
          style={({ pressed }) => [styles.edit, pressed && { opacity: 0.6 }]}
        >
          <T size={13} weight="700" color={colors.brandDark}>
            바꾸기
          </T>
        </Pressable>
      </View>
      <View style={styles.row}>
        {DAYS.map((d, i) => {
          const amount = dayBudgets[i] ?? 0;
          const on = i === today;
          const past = i < today;
          const ink = on
            ? colors.brand
            : past
              ? colors.textMuted
              : colors.textSub;
          return (
            <View
              key={d}
              style={styles.day}
              accessible
              accessibilityLabel={`${d}요일 ${won(amount)}원${on ? ", 오늘" : ""}`}
            >
              <T size={13} weight={on ? "800" : "500"} color={ink}>
                {d}
              </T>
              <View style={styles.barBox}>
                <View
                  style={[
                    styles.bar,
                    {
                      height: `${Math.max(8, (amount / top) * 100)}%`,
                      backgroundColor: on
                        ? colors.brand
                        : past
                          ? colors.sunken
                          : colors.brandSoft,
                    },
                  ]}
                />
              </View>
              <T size={12} weight={on ? "800" : "500"} color={ink} num>
                {short(amount)}
              </T>
            </View>
          );
        })}
      </View>
      <T size={13} color={colors.textMuted}>
        {presetNote(preset)}
      </T>
    </Card>
  );
}
const styles = StyleSheet.create({
  head: {
    flexDirection: "row",
    alignItems: "center",
    gap: 8,
  },
  chip: {
    paddingHorizontal: 8,
    paddingVertical: 4,
    borderRadius: radius.sm,
    backgroundColor: colors.sunken,
  },
  edit: { paddingHorizontal: 4, paddingVertical: 4 },
  row: { flexDirection: "row", gap: 6 },
  day: { flex: 1, alignItems: "center", gap: 6 },
  barBox: { alignSelf: "stretch", height: 64, justifyContent: "flex-end" },
  bar: { alignSelf: "stretch", borderRadius: radius.sm },
});
