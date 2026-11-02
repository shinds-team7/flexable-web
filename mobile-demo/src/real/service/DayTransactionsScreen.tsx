import { router, useLocalSearchParams } from "expo-router";
import { Button, Card, T } from "@/real/components/ui";
import { validDate } from "./occurredAt";
import { useServerExtensions } from "./serverExtensions";
import type { Transaction, ScheduledExpense } from "./types";
import {
  ErrorNotice,
  Loading,
  money,
  Page,
  seoulDate,
  useResource,
} from "./ui";

export function DayTransactionsScreen() {
  const extensions = useServerExtensions();
  const { date } = useLocalSearchParams<{ date?: string }>();
  const valid = !!date && validDate(date) && date <= seoulDate();
  const result = useResource<{ items: Transaction[] }>(
    valid ? `/transactions?from=${date}&to=${date}&type=EXPENSE` : null,
  );
  const planned = useResource<{ items: ScheduledExpense[] }>(
    valid && extensions.available
      ? `/scheduled-expenses?from=${date}&to=${date}`
      : null,
  );
  return (
    <Page title="날짜별 지출 기록">
      {!valid ? (
        <T>오늘 또는 지난 날짜를 선택해 주세요</T>
      ) : (
        <>
          <T size={20} weight="700">
            {date} 지출 기록
          </T>
          <Button
            label="이 날짜에 지출 기록"
            onPress={() =>
              router.push({ pathname: "/transactions/new", params: { date } })
            }
          />
          <ErrorNotice error={result.error} retry={result.retry} />
          <ErrorNotice error={planned.error} retry={planned.retry} />
          {!!planned.data?.items.length && (
            <Card style={{ gap: 8 }}>
              <T weight="700">이 날짜에 남은 지출 예정</T>
              {planned.data.items.map((item) => (
                <T key={item.id}>
                  {item.title} · {money(item.amount)}원
                </T>
              ))}
              <Button
                label="예정 기록 관리"
                variant="soft"
                onPress={() =>
                  router.push({
                    pathname: "/scheduled-expenses",
                    params: { date },
                  })
                }
              />
            </Card>
          )}
          {result.loading && <Loading />}
          {!result.loading && result.data?.items.length === 0 && (
            <T>기록한 지출이 없어요</T>
          )}
          {!result.loading &&
            result.data?.items
              .filter((t) => t.type === "EXPENSE")
              .map((t) => (
                <Card
                  key={t.id}
                  accessibilityLabel={`${t.title}, ${money(t.amount)}원, 상세 보기`}
                  onPress={() => router.push(`/transactions/${t.id}`)}
                  style={{ gap: 6 }}
                >
                  <T weight="700">{t.title}</T>
                  <T>{money(t.amount)}원</T>
                  <T size={13}>{t.category?.name ?? "카테고리 없음"}</T>
                </Card>
              ))}
        </>
      )}
    </Page>
  );
}
