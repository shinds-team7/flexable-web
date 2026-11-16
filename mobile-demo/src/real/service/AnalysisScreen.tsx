import Ionicons from "@expo/vector-icons/Ionicons";
import { useCallback, useRef, useState } from "react";
import { router, useFocusEffect } from "expo-router";
import { Pressable, View } from "react-native";
import { Donut } from "@/real/components/Donut";
import { Button, Card, Screen, Segment, Sheet, T } from "@/real/components/ui";
import {
  CategoryIcon,
  ErrorNotice,
  Loading,
  money,
  seoulDate,
  usePreviousWhileLoading,
  useResource,
} from "./ui";
import type { Analysis, Today } from "./types";
import { colors } from "@/real/theme";
const SPANS = [
  [3, "3개월"],
  [6, "6개월"],
  [12, "1년"],
] as const;
export function AnalysisScreen() {
  const [period, setPeriod] = useState("month");
  // "전체"에서 고르는 기간(개월). 서버가 한 번에 읽는 최대 366일 안이다
  const [span, setSpan] = useState(12);
  const [spanOpen, setSpanOpen] = useState(false);
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
      setPeriod("month");
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
  const monday = new Date(
    d.getTime() + ((period === "week" ? offset * 7 : 0) - day) * 86400000,
  )
    .toISOString()
    .slice(0, 10);
  const sunday = new Date(
    d.getTime() + ((period === "week" ? offset * 7 : 0) + 6 - day) * 86400000,
  )
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
  const baseMonday = new Date(d.getTime() - day * 86400000).toISOString().slice(0, 10);
  const baseSunday = new Date(d.getTime() + (6 - day) * 86400000).toISOString().slice(0, 10);
  const baseMonth = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth(), 1));
  const baseMonthEnd = new Date(Date.UTC(d.getUTCFullYear(), d.getUTCMonth() + 1, 0)).toISOString().slice(0, 10);
  // 세 기본 기간을 함께 읽어 두면 탭을 바꾸는 순간 이미 그릴 데이터가 있다.
  const weekResult = useResource<Analysis>(`/analysis/summary?from=${baseMonday}&to=${baseSunday}`);
  const monthResult = useResource<Analysis>(`/analysis/summary?from=${baseMonth.toISOString().slice(0, 10)}&to=${baseMonthEnd}`);
  const allResult = useResource<Analysis>(`/analysis/summary?from=${spanStart}&to=${date}`);
  const shiftedResult = useResource<Analysis>(offset !== 0 && period !== "all"
    ? `/analysis/summary?from=${from}&to=${to}` : null);
  const result = offset !== 0 && period !== "all" ? shiftedResult
    : period === "week" ? weekResult : period === "month" ? monthResult : allResult;
  const { displayData: s } = usePreviousWhileLoading(result.data, result.loading);
  const selected =
    selection?.from === from && selection.to === to
      ? s?.byCategory.find((c) => c.categoryId === selection.categoryId)
      : undefined;
  return (
    <Screen>
      <Segment
        animated
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
      <ErrorNotice error={today.error} retry={today.retry} />
      <ErrorNotice error={result.error} retry={result.retry} />
      {result.loading && !s && <Loading />}
      {s && (
        <>
          <Card style={{ alignItems: "center", gap: 12 }}>
            {period === "all" ? (
              <View
                style={{
                  flexDirection: "row",
                  alignSelf: "stretch",
                  alignItems: "center",
                  gap: 8,
                }}
              >
                <T size={18} weight="800" style={{ flex: 1 }}>
                  기록한 지출 {s.expenseCount}건
                </T>
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="분석 기간 선택"
                  onPress={() => setSpanOpen(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 6,
                    minHeight: 44,
                    paddingHorizontal: 10,
                  }}
                >
                  <T weight="700">
                    {SPANS.find(([months]) => months === span)?.[1]}
                  </T>
                  <Ionicons
                    name="chevron-down"
                    size={16}
                    color={colors.textSub}
                  />
                </Pressable>
              </View>
            ) : (
              <>
                <View
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    alignSelf: "stretch",
                  }}
                >
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      period === "week" ? "이전 주" : "이전 달"
                    }
                    onPress={() => {
                      setOffset((x) => x - 1);
                      setSelection(undefined);
                    }}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="chevron-back"
                      size={22}
                      color={colors.text}
                    />
                  </Pressable>
                  <T weight="700" style={{ flex: 1, textAlign: "center" }}>
                    {period === "week"
                      ? `${shortDay(from)} ~ ${shortDay(to)}`
                      : `${month.getUTCFullYear()}년 ${month.getUTCMonth() + 1}월`}
                  </T>
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={
                      period === "week" ? "다음 주" : "다음 달"
                    }
                    onPress={() => {
                      setOffset((x) => x + 1);
                      setSelection(undefined);
                    }}
                    style={{
                      width: 44,
                      height: 44,
                      alignItems: "center",
                      justifyContent: "center",
                    }}
                  >
                    <Ionicons
                      name="chevron-forward"
                      size={22}
                      color={colors.text}
                    />
                  </Pressable>
                </View>
                <T size={20} weight="800" style={{ alignSelf: "flex-start" }}>
                  기록한 지출 {s.expenseCount}건
                </T>
              </>
            )}
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
      <Sheet
        visible={spanOpen && period === "all"}
        title="분석 기간 선택"
        onClose={() => setSpanOpen(false)}
      >
        <View style={{ gap: 8 }}>
          {SPANS.map(([months, label]) => (
            <Button
              key={months}
              label={label}
              accessibilityLabel={`${label} 기간으로 보기`}
              variant={months === span ? "primary" : "neutral"}
              onPress={() => {
                setSpan(months);
                setSelection(undefined);
                setSpanOpen(false);
              }}
            />
          ))}
        </View>
      </Sheet>
    </Screen>
  );
}

function shortDay(date: string) {
  const [, month, day] = date.split("-");
  return `${Number(month)}/${Number(day)}`;
}
