import { router } from "expo-router";
import { ScrollView, View } from "react-native";
import { Card, Sheet, T } from "@/real/components/ui";
import type { Transaction } from "./types";
import { ErrorNotice, Loading, money, toSeoulInput, useResource } from "./ui";

/** 이번 주 월~금 중 오늘까지의 직접 지출. 예산 계산은 서버 값을 유지한다. */
export function WeekExpensesSheet({
  visible,
  date,
  onClose,
}: {
  visible: boolean;
  date: string;
  onClose: () => void;
}) {
  const end = new Date(date + "T00:00:00Z");
  const weekday = (end.getUTCDay() + 6) % 7;
  const days = Array.from({ length: Math.min(weekday, 4) + 1 }, (_, i) =>
    new Date(end.getTime() - (weekday - i) * 86400000)
      .toISOString()
      .slice(0, 10),
  );
  const result = useResource<{ items: Transaction[] }>(
    visible
      ? `/transactions?from=${days[0]}&to=${days[days.length - 1]}&type=EXPENSE`
      : null,
  );
  const transactions = result.data?.items ?? [];
  return (
    <Sheet visible={visible} onClose={onClose} title="이번 주 평일 지출 내역">
      <ScrollView contentContainerStyle={{ gap: 12 }}>
        <T size={13}>
          이번 주 월요일부터 오늘까지, 금요일까지만 보여 드려요. 고정지출 자동
          기록은 제외해요
        </T>
        <ErrorNotice error={result.error} retry={result.retry} />
        {result.loading && <Loading />}
        {result.data &&
          !result.loading &&
          days.map((day) => {
            const items = transactions.filter(
              (t) =>
                t.type === "EXPENSE" &&
                !t.fromFixed &&
                toSeoulInput(t.occurredAt).slice(0, 10) === day,
            );
            return (
              <Card key={day} style={{ gap: 8 }}>
                <T weight="700">
                  {day}
                  {day === date ? " · 오늘" : ""}
                </T>
                <T>{money(items.reduce((sum, t) => sum + t.amount, 0))}원</T>
                {items.length === 0 && <T size={13}>기록한 지출이 없어요</T>}
                {items.map((t) => (
                  <Card
                    key={t.id}
                    accessibilityLabel={`${t.title}, ${money(t.amount)}원, 상세 보기`}
                    onPress={() => {
                      onClose();
                      router.push(`/transactions/${t.id}`);
                    }}
                    style={{ padding: 8 }}
                  >
                    <View
                      style={{
                        flexDirection: "row",
                        justifyContent: "space-between",
                        gap: 8,
                      }}
                    >
                      <T style={{ flex: 1 }}>{t.title}</T>
                      <T>{money(t.amount)}원</T>
                    </View>
                  </Card>
                ))}
              </Card>
            );
          })}
      </ScrollView>
    </Sheet>
  );
}
