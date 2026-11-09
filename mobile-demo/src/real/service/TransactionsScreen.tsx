import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useState } from "react";
import { Pressable, View } from "react-native";
import { Card, Screen, Segment, T } from "@/real/components/ui";
import { MonthCalendar, type DayTotals } from "@/real/components/MonthCalendar";
import {
  CategoryIcon,
  ErrorNotice,
  Loading,
  money,
  seoulDate,
  toSeoulInput,
  useResource,
} from "./ui";
import type { Transaction } from "./types";
import { colors } from "@/real/theme";
import { useServerExtensions } from "./serverExtensions";
// 서버가 거래의 카테고리를 찾지 못하면 category가 null로 온다(docs/contracts/app-api.yaml Transaction).
const NO_CATEGORY = {
  name: "카테고리 없음",
  icon: "pricetag",
  color: colors.textMuted,
};
const categoryOf = (t: Transaction) => t.category ?? NO_CATEGORY;
export function TransactionsScreen() {
  const extensions = useServerExtensions();
  const [offset, setOffset] = useState(0);
  // 다른 달을 보다가 다른 화면에 다녀오면 다시 이번 달 달력을 보여 준다
  useFocusEffect(
    useCallback(() => {
      setOffset(0);
    }, []),
  );
  const [filter, setFilter] = useState("ALL");
  const [y, m] = seoulDate().split("-").map(Number);
  const month = new Date(Date.UTC(y, m - 1 + offset, 1));
  const from = month.toISOString().slice(0, 10);
  const to = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  const { data, error, loading, retry } = useResource<{ items: Transaction[] }>(
    `/transactions?from=${from}&to=${to}`,
  );
  const items = data?.items ?? [];
  const groups = new Map<string, Transaction[]>();
  items
    .filter((t) => filter === "ALL" || t.type === filter)
    .forEach((t) => {
      const d = toSeoulInput(t.occurredAt).slice(0, 10);
      groups.set(d, [...(groups.get(d) ?? []), t]);
    });
  const total = (type: string) =>
    items.filter((x) => x.type === type).reduce((a, x) => a + x.amount, 0);
  // 달력은 아래 목록 필터와 상관없이 그달의 지출·수입을 모두 날짜별로 보여준다.
  const daily = new Map<string, DayTotals>();
  items.forEach((t) => {
    const d = toSeoulInput(t.occurredAt).slice(0, 10);
    const sum = daily.get(d) ?? { expense: 0, income: 0 };
    if (t.type === "INCOME") sum.income += t.amount;
    else sum.expense += t.amount;
    daily.set(d, sum);
  });
  return (
    <Screen>
      <Card style={{ paddingTop: 8, gap: 8 }}>
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <MonthStep step={-1} onPress={() => setOffset((x) => x - 1)} />
          <T weight="800">
            {month.getUTCFullYear()}년 {month.getUTCMonth() + 1}월
          </T>
          <MonthStep step={1} onPress={() => setOffset((x) => x + 1)} />
        </View>
        <View
          style={{
            flexDirection: "row",
            backgroundColor: colors.bg,
            borderRadius: 16,
            paddingVertical: 14,
          }}
        >
          {["EXPENSE", "INCOME"].map((type) => (
            <View key={type} style={{ flex: 1, alignItems: "center", gap: 4 }}>
              <T size={12}>{type === "EXPENSE" ? "지출" : "수입"}</T>
              <T
                size={18}
                weight="800"
                color={type === "INCOME" ? colors.brand : colors.text}
              >
                {money(total(type))}원
              </T>
            </View>
          ))}
        </View>
        <MonthCalendar
          year={month.getUTCFullYear()}
          month={month.getUTCMonth() + 1}
          today={seoulDate()}
          totals={daily}
          allowFuture={extensions.available}
          onSelect={(date) =>
            router.push({
              pathname:
                // 오늘·지난 날짜는 그 날짜가 채워진 거래 직접 기록으로 바로 간다
                date > seoulDate()
                  ? "/scheduled-expenses"
                  : "/transactions/new",
              params: { date },
            })
          }
        />
        <T size={12} color={colors.textMuted}>
          {extensions.available
            ? "지난 날짜는 지출 기록을, 미래 날짜는 지출 예정을 등록할 수 있어요"
            : "오늘과 지난 날짜의 지출을 기록할 수 있어요. 지출 예정 기능은 준비 중이에요"}
        </T>
      </Card>
      <Segment
        items={[
          { key: "ALL", label: "전체" },
          { key: "EXPENSE", label: "지출" },
          { key: "INCOME", label: "수입" },
        ]}
        value={filter}
        onChange={setFilter}
      />
      <ErrorNotice error={error} retry={retry} />
      {loading ? (
        <Loading />
      ) : (
        !error && (
          <Card style={{ paddingVertical: 8 }}>
            {groups.size === 0 && (
              <T style={{ paddingVertical: 24, textAlign: "center" }}>
                거래내역이 없어요
              </T>
            )}
            {[...groups].map(([date, list], i) => (
              <View
                key={date}
                style={
                  i > 0 && {
                    borderTopWidth: 1,
                    borderTopColor: colors.line,
                    marginTop: 6,
                  }
                }
              >
                <T
                  size={13}
                  weight="700"
                  style={{ paddingTop: 14, paddingBottom: 6 }}
                >
                  {date === seoulDate() ? "오늘" : date}
                </T>
                {list.map((t) => (
                  <Pressable
                    key={t.id}
                    accessibilityRole="button"
                    accessibilityLabel={`${t.title}, ${money(t.amount)}원, 상세 보기`}
                    onPress={() => router.push(`/transactions/${t.id}`)}
                    style={{
                      flexDirection: "row",
                      alignItems: "center",
                      gap: 12,
                      paddingVertical: 12,
                    }}
                  >
                    <View
                      style={{
                        width: 40,
                        height: 40,
                        borderRadius: 20,
                        alignItems: "center",
                        justifyContent: "center",
                        backgroundColor: categoryOf(t).color + "1F",
                      }}
                    >
                      <CategoryIcon
                        icon={categoryOf(t).icon}
                        color={categoryOf(t).color}
                      />
                    </View>
                    <View style={{ flex: 1, gap: 3 }}>
                      <T weight="600" numberOfLines={1}>
                        {t.title}
                      </T>
                      <T size={12} color={colors.textMuted}>
                        {categoryOf(t).name}
                      </T>
                    </View>
                    <T
                      weight="700"
                      color={t.type === "INCOME" ? colors.brand : colors.text}
                    >
                      {t.type === "INCOME" ? "+" : "-"}
                      {money(t.amount)}원
                    </T>
                  </Pressable>
                ))}
              </View>
            ))}
          </Card>
        )
      )}
    </Screen>
  );
}
function MonthStep({ step, onPress }: { step: -1 | 1; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={step < 0 ? "이전 달" : "다음 달"}
      onPress={onPress}
      hitSlop={6}
      style={{
        width: 44,
        height: 44,
        alignItems: "center",
        justifyContent: "center",
      }}
    >
      <Ionicons
        name={step < 0 ? "chevron-back" : "chevron-forward"}
        size={22}
        color={colors.brandDark}
      />
    </Pressable>
  );
}
