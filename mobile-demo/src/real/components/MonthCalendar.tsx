import { Pressable, StyleSheet, View } from "react-native";
import { T } from "./ui";
import { colors } from "@/real/theme";
import { DOW, won } from "@/real/utils/format";

/** planned는 예정 지출 합계(실제 지출이 아니라 따로 표시) */
export type DayTotals = { expense: number; income: number; planned?: number };

/** 칸 안 금액 글자: 줄이지 않은 금액 + "원"(예: "-32,400원") */
export function dayAmountText(sign: "+" | "-" | "예정 ", n: number) {
  return `${sign}${won(n)}원`;
}

/** 금액이 길어질수록 글자를 줄인다(좁은 칸에 한 줄로). Android는 칸 폭에 맞춰 한 번 더 줄인다 */
export function dayAmountSize(text: string) {
  const n = text.length;
  return n <= 6 ? 10 : n <= 8 ? 9 : n <= 10 ? 8 : 7;
}

function Amount({ text, color }: { text: string; color?: string }) {
  return (
    <T
      size={dayAmountSize(text)}
      weight="600"
      color={color}
      num
      numberOfLines={1}
      adjustsFontSizeToFit
      minimumFontScale={0.6}
      style={{ maxWidth: "100%", letterSpacing: -0.4 }}
    >
      {text}
    </T>
  );
}

/** 일요일부터 시작하는 주 단위 칸. 그달이 아닌 칸은 null */
export function monthWeeks(year: number, month: number) {
  const first = new Date(Date.UTC(year, month - 1, 1)).getUTCDay();
  const days = new Date(Date.UTC(year, month, 0)).getUTCDate();
  const cells: (number | null)[] = [
    ...Array<null>(first).fill(null),
    ...Array.from({ length: days }, (_, i) => i + 1),
  ];
  while (cells.length % 7) cells.push(null);
  return Array.from({ length: cells.length / 7 }, (_, i) =>
    cells.slice(i * 7, i * 7 + 7),
  );
}

/**
 * 한 달 달력에 날짜별 수입(+)·지출(-) 합계와 예정 지출("예정")을 표시한다. 일요일부터 시작한다.
 * 합계는 화면이 받은 거래 금액을 날짜별로 더한 값을 props로 받는다.
 */
export function MonthCalendar({
  year,
  month,
  today,
  totals,
  onSelect,
  allowFuture = true,
}: {
  year: number;
  /** 1~12 */
  month: number;
  /** 오늘 날짜 "YYYY-MM-DD"(서울) */
  today: string;
  /** "YYYY-MM-DD" → 그날 합계 */
  totals: Map<string, DayTotals>;
  onSelect?: (date: string) => void;
  allowFuture?: boolean;
}) {
  const weeks = monthWeeks(year, month);
  const prefix = `${year}-${String(month).padStart(2, "0")}-`;
  return (
    <View style={{ gap: 4 }}>
      <View style={styles.row}>
        {DOW.map((d) => (
          <T
            key={d}
            size={12}
            weight="600"
            color={colors.textMuted}
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
            const date = prefix + String(day).padStart(2, "0");
            const on = date === today;
            const t = totals.get(date);
            const label = [
              `${month}월 ${day}일${on ? ", 오늘" : ""}`,
              t?.income ? `수입 ${won(t.income)}원` : null,
              t?.expense ? `지출 ${won(t.expense)}원` : null,
              t?.planned ? `예정 지출 ${won(t.planned)}원` : null,
            ]
              .filter(Boolean)
              .join(", ");
            return (
              <Pressable
                key={i}
                style={styles.cell}
                accessible
                accessibilityLabel={label}
                accessibilityRole={onSelect ? "button" : undefined}
                disabled={!onSelect || (!allowFuture && date > today)}
                onPress={() => onSelect?.(date)}
              >
                <View style={[styles.date, on && styles.today]}>
                  <T
                    size={12}
                    weight={on ? "800" : "500"}
                    color={on ? colors.onBrand : colors.textSub}
                    num
                  >
                    {day}
                  </T>
                </View>
                {/* 수입(+)을 지출(-) 위에 */}
                {!!t?.income && (
                  <Amount
                    text={dayAmountText("+", t.income)}
                    color={colors.brand}
                  />
                )}
                {!!t?.expense && (
                  <Amount text={dayAmountText("-", t.expense)} />
                )}
                {!!t?.planned && (
                  <Amount
                    text={dayAmountText("예정 ", t.planned)}
                    color={colors.warn}
                  />
                )}
              </Pressable>
            );
          })}
        </View>
      ))}
    </View>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: "row" },
  dow: { flex: 1, textAlign: "center", paddingVertical: 4 },
  cell: {
    flex: 1,
    alignItems: "center",
    minHeight: 52,
    paddingVertical: 2,
    paddingHorizontal: 1,
    minWidth: 0,
  },
  date: {
    width: 22,
    height: 22,
    borderRadius: 11,
    alignItems: "center",
    justifyContent: "center",
    marginBottom: 2,
  },
  today: { backgroundColor: colors.brand },
});
