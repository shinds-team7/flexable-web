import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, View } from "react-native";
import { Donut } from "@/real/components/Donut";
import { Button, Card, Screen, Segment, T } from "@/real/components/ui";
import {
  CategoryIcon,
  ErrorNotice,
  Loading,
  money,
  seoulDate,
  useResource,
} from "./ui";
import type { Analysis, Today } from "./types";
import { colors } from "@/real/theme";
const SPANS = [
  [1, "1개월"],
  [3, "3개월"],
  [6, "6개월"],
  [12, "1년"],
] as const;
export function AnalysisScreen() {
  const [period, setPeriod] = useState("week");
  // "전체"에서 고르는 기간(개월). 서버가 한 번에 읽는 최대 366일 안이다
  const [span, setSpan] = useState(12);
  const [offset, setOffset] = useState(0);
  const [selection, setSelection] = useState<{
    from: string;
    to: string;
    categoryId: number;
  }>();
  // 카테고리 거래내역을 보고 돌아올 때는 보던 기간을 그대로 둔다
  const openedCategory = useRef(false);
  useFocusEffect(
    useCallback(() => {
      if (openedCategory.current) {
        openedCategory.current = false;
        return;
      }
      setPeriod("week");
      setSpan(12);
      setOffset(0);
      setSelection(undefined);
    }, []),
  );
  const today = useResource<Today>("/budget/today");
  const date = today.data?.date ?? seoulDate();
  const d = new Date(date + "T00:00:00Z");
  const day = (d.getUTCDay() + 6) % 7;
  const month = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + offset, 1),
  );
  const monthEnd = new Date(
    Date.UTC(month.getUTCFullYear(), month.getUTCMonth() + 1, 0),
  )
    .toISOString()
    .slice(0, 10);
  const monday = new Date(d.getTime() - day * 86400000)
    .toISOString()
    .slice(0, 10);
  const sunday = new Date(d.getTime() + (6 - day) * 86400000)
    .toISOString()
    .slice(0, 10);
  // "전체" covers the last `span` months up to today (12 months is at most 366 days, the longest range the API accepts).
  const spanStart = new Date(
    Date.UTC(d.getUTCFullYear(), d.getUTCMonth() - span, d.getUTCDate() + 1),
  )
    .toISOString()
    .slice(0, 10);
  const from =
    period === "week"
      ? monday
      : period === "month"
        ? month.toISOString().slice(0, 10)
        : spanStart;
  const to = period === "week" ? sunday : period === "month" ? monthEnd : date;
  const result = useResource<Analysis>(
    from ? `/analysis/summary?from=${from}&to=${to}` : null,
  );
  const s = result.data;
  const selected =
    selection?.from === from && selection.to === to
      ? s?.byCategory.find((c) => c.categoryId === selection.categoryId)
      : undefined;
  return (
    <Screen>
      <Segment
        items={[
          { key: "week", label: "이번 주" },
          { key: "month", label: "이번 달" },
          { key: "all", label: "전체" },
        ]}
        value={period}
        onChange={(value) => {
          setPeriod(value);
          setOffset(0);
          setSelection(undefined);
        }}
      />
      {period === "month" && (
        <View
          style={{
            flexDirection: "row",
            alignItems: "center",
            justifyContent: "space-between",
          }}
        >
          <Button
            label="이전 달"
            variant="ghost"
            onPress={() => {
              setOffset((x) => x - 1);
              setSelection(undefined);
            }}
          />
          <T weight="700">
            {month.getUTCFullYear()}년 {month.getUTCMonth() + 1}월
          </T>
          <Button
            label="다음 달"
            variant="ghost"
            onPress={() => {
              setOffset((x) => x + 1);
              setSelection(undefined);
            }}
          />
        </View>
      )}
      <ErrorNotice error={today.error} retry={today.retry} />
      <ErrorNotice error={result.error} retry={result.retry} />
      {result.loading && <Loading />}
      {s && !result.loading && (
        <>
          <Card style={{ alignItems: "center", gap: 12 }}>
            {period === "all" ? (
              <View
                style={{ alignSelf: "flex-end", flexDirection: "row", gap: 6 }}
              >
                {SPANS.map(([months, label]) => {
                  const on = months === span;
                  return (
                    <Pressable
                      key={months}
                      accessibilityRole="button"
                      accessibilityLabel={`${label} 기간으로 보기`}
                      accessibilityState={{ selected: on }}
                      onPress={() => {
                        setSpan(months);
                        setSelection(undefined);
                      }}
                      style={{
                        paddingHorizontal: 10,
                        paddingVertical: 6,
                        borderRadius: 999,
                        backgroundColor: on ? colors.brand : colors.sunken,
                      }}
                    >
                      <T
                        size={12}
                        weight="700"
                        color={on ? colors.onBrand : colors.textSub}
                      >
                        {label}
                      </T>
                    </Pressable>
                  );
                })}
              </View>
            ) : (
              <T style={{ alignSelf: "flex-start" }}>
                {s.from} ~ {s.to}
              </T>
            )}
            <T size={20} weight="800" style={{ alignSelf: "flex-start" }}>
              기록한 지출 {s.expenseCount}건
            </T>
            <View
              style={{
                flexDirection: "row",
                alignItems: "center",
                justifyContent: "center",
                flexWrap: "wrap",
                gap: 12,
                alignSelf: "stretch",
              }}
            >
              <Donut
                size={180}
                total={s.expenseTotal}
                selectedIndex={
                  selected ? s.byCategory.indexOf(selected) : undefined
                }
                onSelect={(index) =>
                  setSelection({
                    from,
                    to,
                    categoryId: s.byCategory[index].categoryId,
                  })
                }
                segments={s.byCategory.map((c) => ({
                  value: c.amount,
                  color: c.color,
                  accessibilityLabel: `${c.name}, ${money(c.amount)}원, ${c.count}건`,
                  label:
                    c.ratio >= 0.06
                      ? `${Math.round(c.ratio * 100)}%`
                      : undefined,
                }))}
              >
                <T size={13}>사용 금액</T>
                <T size={22} weight="800">
                  {money(s.expenseTotal)}원
                </T>
              </Donut>
              {selected && (
                <View
                  accessibilityLiveRegion="polite"
                  style={{
                    flexBasis: 120,
                    flexGrow: 1,
                    maxWidth: 200,
                    backgroundColor: colors.brandSoft,
                    borderRadius: 12,
                    padding: 12,
                    gap: 6,
                  }}
                >
                  <T weight="700">{selected.name}</T>
                  <T weight="700">{money(selected.amount)}원</T>
                  <T size={13}>
                    {selected.count}건 · {Math.round(selected.ratio * 100)}%
                  </T>
                </View>
              )}
            </View>
            <View
              style={{
                alignSelf: "stretch",
                backgroundColor: colors.bg,
                borderRadius: 16,
                padding: 14,
                marginTop: 14,
              }}
            >
              <T>수입 {money(s.incomeTotal)}원</T>
            </View>
          </Card>
          <Card>
            <T size={17} weight="700">
              카테고리별 사용 현황
            </T>
            {s.byCategory.length === 0 && (
              <T style={{ paddingVertical: 24 }}>기록한 지출이 없어요</T>
            )}
            <View
              style={{
                flexDirection: "row",
                height: 12,
                borderRadius: 6,
                overflow: "hidden",
                gap: 2,
                marginTop: 14,
              }}
            >
              {s.byCategory.map((c) => (
                <Pressable
                  key={c.categoryId}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name} 카테고리 정보 보기`}
                  accessibilityState={{
                    selected: selected?.categoryId === c.categoryId,
                  }}
                  onPress={() =>
                    setSelection({ from, to, categoryId: c.categoryId })
                  }
                  style={{ flex: c.amount, backgroundColor: c.color }}
                />
              ))}
            </View>
            <View style={{ gap: 18, marginTop: 20 }}>
              {s.byCategory.map((c) => (
                <Pressable
                  key={c.categoryId}
                  accessibilityRole="button"
                  accessibilityLabel={`${c.name} 카테고리 거래내역 보기`}
                  onPress={() => {
                    openedCategory.current = true;
                    router.push({
                      pathname: "/category-transactions",
                      params: {
                        categoryId: String(c.categoryId),
                        name: c.name,
                      },
                    });
                  }}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 12,
                  }}
                >
                  <CategoryIcon icon={c.icon} color={c.color} />
                  <View style={{ flex: 1, gap: 6 }}>
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                      }}
                    >
                      <T weight="600">
                        {c.name} <T size={12}>{c.count}건</T>
                      </T>
                      <T weight="700">{money(c.amount)}원</T>
                    </View>
                    <View
                      style={{
                        flexDirection: "row",
                        gap: 8,
                        alignItems: "center",
                      }}
                    >
                      <View
                        style={{
                          flex: 1,
                          height: 6,
                          backgroundColor: colors.bg,
                          borderRadius: 3,
                        }}
                      >
                        <View
                          style={{
                            height: 6,
                            width: `${c.ratio * 100}%`,
                            backgroundColor: c.color,
                            borderRadius: 3,
                          }}
                        />
                      </View>
                      <T size={12} color={colors.textMuted}>
                        {money(c.amount)} / {money(s.expenseTotal)}
                      </T>
                    </View>
                  </View>
                </Pressable>
              ))}
            </View>
          </Card>
        </>
      )}
    </Screen>
  );
}
