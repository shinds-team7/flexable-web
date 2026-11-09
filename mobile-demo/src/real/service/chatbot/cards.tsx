import { View } from "react-native";
import { Donut } from "@/real/components/Donut";
import { T } from "@/real/components/ui";
import { colors, space, type } from "@/real/theme";
import { won } from "@/real/utils/format";
import { ApiError } from "../api/client";
import type { Analysis, Today } from "../types";
import { CategoryIcon, seoulDate, useResource } from "../ui";
import { addDays, shortDate } from "./model";
import { styles } from "./styles";

/**
 * 서버가 AI 메이트에 보내는 기간과 같다: 이번 기간은 수입 주기 시작(예산이 없으면 이번 달 1일)부터 오늘까지,
 * 직전 기간은 그 바로 앞 같은 일수.
 */
function usePeriods() {
  const today = useResource<Today>("/budget/today");
  if (today.loading && !today.data) return null;
  const to = today.data?.date ?? seoulDate();
  let from = today.data?.cycleStart ?? to.slice(0, 8) + "01";
  if (from > to) from = to;
  const days =
    (Date.parse(to + "T00:00:00Z") - Date.parse(from + "T00:00:00Z")) /
      86400000 +
    1;
  return {
    current: { from, to },
    previous: { from: addDays(from, -days), to: addDays(from, -1) },
  };
}

function useSummary(range: { from: string; to: string } | undefined) {
  return useResource<Analysis>(
    range ? `/analysis/summary?from=${range.from}&to=${range.to}` : null,
  );
}

/** 카드 데이터를 불러오는 동안·실패했을 때 같은 자리를 쓴다. */
function CardNote({ text }: { text: string }) {
  return (
    <View style={styles.card}>
      <T size={type.caption} color={colors.textMuted}>
        {text}
      </T>
    </View>
  );
}

export function BudgetCard() {
  const r = useResource<Today>("/budget/today");
  if (r.loading && !r.data)
    return <CardNote text="오늘 예산을 불러오고 있어요" />;
  if (!r.data)
    return (
      <CardNote
        text={
          r.error instanceof ApiError && r.error.code === "BUDGET_NOT_SET"
            ? "예산을 설정하면 오늘 쓸 수 있는 돈을 보여 드려요"
            : "오늘 예산을 불러오지 못했어요"
        }
      />
    );
  const b = r.data;
  const usedRatio =
    b.dailyBudget > 0
      ? Math.min(1, Math.max(0, b.todaySpent / b.dailyBudget))
      : 1;
  const over = b.todayAvailable < 0;
  return (
    <View style={styles.card}>
      <T size={type.caption} color={colors.textMuted}>
        {over ? "오늘 예산을 넘었어요" : "오늘 쓸 수 있는 돈"}
      </T>
      <T size={30} weight="800" color={over ? colors.danger : colors.brand} num>
        {won(b.todayAvailable)}원
      </T>
      <View style={styles.track}>
        <View
          style={[
            styles.fill,
            {
              width: `${usedRatio * 100}%`,
              backgroundColor: over ? colors.danger : colors.brand,
            },
          ]}
        />
      </View>
      <View style={styles.between}>
        <Stat label="남은 생활비" value={`${won(b.remaining)}원`} />
        <Stat label="다음 수입일까지" value={`${b.daysLeft}일`} alignEnd />
      </View>
      <T size={type.caption} color={colors.textMuted}>
        입력한 잔액·기록 기준 추정이에요
      </T>
    </View>
  );
}

function Stat({
  label,
  value,
  alignEnd,
}: {
  label: string;
  value: string;
  alignEnd?: boolean;
}) {
  return (
    <View style={{ alignItems: alignEnd ? "flex-end" : "flex-start", gap: 2 }}>
      <T size={type.caption} color={colors.textMuted}>
        {label}
      </T>
      <T size={type.body} weight="700" num>
        {value}
      </T>
    </View>
  );
}

export function TopCard() {
  const periods = usePeriods();
  const r = useSummary(periods?.current);
  if (!periods || (r.loading && !r.data))
    return <CardNote text="지출 기록을 불러오고 있어요" />;
  if (!r.data) return <CardNote text="지출 기록을 불러오지 못했어요" />;
  const s = r.data;
  if (s.expenseTotal <= 0)
    return <CardNote text="이번 기간에 기록한 지출이 아직 없어요" />;
  return (
    <View style={styles.card}>
      <View style={{ alignItems: "center" }}>
        <Donut
          size={150}
          stroke={18}
          total={s.expenseTotal}
          segments={s.byCategory.map((c) => ({
            value: c.amount,
            color: c.color,
          }))}
        >
          <T size={12} color={colors.textMuted}>
            {shortDate(s.from)}~{shortDate(s.to)} 지출
          </T>
          <T size={type.body} weight="800" num>
            {won(s.expenseTotal)}원
          </T>
        </Donut>
      </View>
      <View style={{ gap: space[3], marginTop: space[2] }}>
        {s.byCategory.slice(0, 3).map((c, i) => (
          <View key={c.categoryId} style={styles.catRow}>
            <T
              size={type.caption}
              weight="700"
              color={colors.textMuted}
              style={{ width: 14 }}
            >
              {i + 1}
            </T>
            <View style={[styles.catIcon, { backgroundColor: c.color + "1A" }]}>
              <CategoryIcon icon={c.icon} color={c.color} />
            </View>
            <View style={{ flex: 1, gap: 6 }}>
              <View style={styles.between}>
                <T weight="600">{c.name}</T>
                <T weight="700" num>
                  {won(c.amount)}원
                </T>
              </View>
              <View style={styles.track}>
                <View
                  style={[
                    styles.fill,
                    {
                      width: `${(c.amount / s.expenseTotal) * 100}%`,
                      backgroundColor: c.color,
                    },
                  ]}
                />
              </View>
            </View>
          </View>
        ))}
      </View>
    </View>
  );
}

export function CompareCard() {
  const periods = usePeriods();
  const now = useSummary(periods?.current);
  const before = useSummary(periods?.previous);
  if (
    !periods ||
    ((now.loading || before.loading) && !(now.data && before.data))
  )
    return <CardNote text="지출 기록을 불러오고 있어요" />;
  if (!now.data || !before.data)
    return <CardNote text="지출 기록을 불러오지 못했어요" />;
  const current = new Map(now.data.byCategory.map((c) => [c.categoryId, c]));
  const previous = new Map(
    before.data.byCategory.map((c) => [c.categoryId, c]),
  );
  // 이번 기간 많이 쓴 순, 그 뒤에 지난 기간에만 있던 카테고리
  const rows = [
    ...now.data.byCategory,
    ...before.data.byCategory.filter((c) => !current.has(c.categoryId)),
  ]
    .slice(0, 6)
    .map((c) => ({
      ...c,
      now: current.get(c.categoryId)?.amount ?? 0,
      before: previous.get(c.categoryId)?.amount ?? 0,
    }));
  if (!rows.length)
    return <CardNote text="두 기간 모두 기록한 지출이 아직 없어요" />;
  const p = periods;
  return (
    <View style={styles.card}>
      <View style={styles.between}>
        <T size={type.caption} color={colors.textMuted}>
          카테고리
        </T>
        <T size={type.caption} color={colors.textMuted}>
          {shortDate(p.previous.from)}~{shortDate(p.previous.to)} 대비
        </T>
      </View>
      {rows.map((c) => {
        const diff = c.now - c.before;
        const up = diff > 0;
        return (
          <View key={c.categoryId} style={styles.catRow}>
            <View style={[styles.catIcon, { backgroundColor: c.color + "1A" }]}>
              <CategoryIcon icon={c.icon} color={c.color} />
            </View>
            <View style={{ flex: 1 }}>
              <T weight="600">{c.name}</T>
              <T size={type.caption} color={colors.textMuted} num>
                {won(c.before)} → {won(c.now)}원
              </T>
            </View>
            {diff !== 0 && (
              <View
                style={[
                  styles.badge,
                  {
                    backgroundColor: up
                      ? colors.dangerSoft
                      : colors.positiveSoft,
                  },
                ]}
              >
                <T
                  size={type.caption}
                  weight="700"
                  color={up ? colors.danger : colors.positive}
                  num
                >
                  {up ? "▲" : "▼"} {won(Math.abs(diff))}
                </T>
              </View>
            )}
          </View>
        );
      })}
      <T size={type.caption} color={colors.textMuted}>
        이번 기간({shortDate(p.current.from)}~{shortDate(p.current.to)})과 바로
        앞 같은 일수를 비교했어요
      </T>
    </View>
  );
}
