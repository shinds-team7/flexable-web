import { router, useLocalSearchParams } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import { ActivityIndicator, FlatList, Pressable, View } from "react-native";
import { SubHeader } from "@/real/components/SubHeader";
import { T } from "@/real/components/ui";
import { colors } from "@/real/theme";
import { api, sessionGeneration } from "./api/client";
import type { Transaction } from "./types";
import {
  CategoryIcon,
  ErrorNotice,
  Loading,
  money,
  seoulDate,
  toSeoulInput,
} from "./ui";

// 목록 API는 한 번에 최대 366일만 읽는다(from~to). 그래서 오늘부터 366일씩 거슬러 올라가며 읽는다.
const WINDOW_DAYS = 366;
const DAY = 86400000;
// 연속으로 이만큼의 구간이 비어 있으면 더 오래된 기록은 없다고 본다.
const EMPTY_WINDOWS = 2;

type Row =
  | { kind: "date"; key: string; date: string }
  | { kind: "tx"; key: string; tx: Transaction };

const shift = (date: string, days: number) =>
  new Date(new Date(date + "T00:00:00Z").getTime() + days * DAY)
    .toISOString()
    .slice(0, 10);

/**
 * 분석의 카테고리를 누르면 열린다. 그 카테고리에 등록된 거래를 기간과 상관없이 최신순으로 보여 주고,
 * 끝까지 내리면 더 오래된 구간을 이어서 읽는다(무한 스크롤).
 */
export function CategoryTransactionsScreen() {
  const { categoryId, name } = useLocalSearchParams<{
    categoryId?: string;
    name?: string;
  }>();
  const id = Number(categoryId);
  const valid = Number.isInteger(id) && id > 0;
  const [items, setItems] = useState<Transaction[]>([]);
  const [error, setError] = useState<unknown>();
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);
  // 다음에 읽을 구간의 끝 날짜와, 연속으로 비어 있던 구간 수
  const cursor = useRef({ to: seoulDate(), empty: 0 });
  const busy = useRef(false);
  const alive = useRef(true);

  const loadMore = useCallback(async () => {
    if (!valid || busy.current) return;
    busy.current = true;
    setLoading(true);
    setError(undefined);
    const generation = sessionGeneration();
    try {
      // 거래가 있는 구간을 만날 때까지(또는 더 없다고 볼 때까지) 이어서 읽는다
      for (;;) {
        const to = cursor.current.to;
        const from = shift(to, -(WINDOW_DAYS - 1));
        const { items: page } = await api<{ items: Transaction[] }>(
          `/transactions?from=${from}&to=${to}&categoryId=${id}`,
        );
        if (!alive.current || generation !== sessionGeneration()) return;
        cursor.current = {
          to: shift(from, -1),
          empty: page.length === 0 ? cursor.current.empty + 1 : 0,
        };
        setItems((previous) => [...previous, ...page]);
        if (cursor.current.empty >= EMPTY_WINDOWS) {
          setDone(true);
          break;
        }
        if (page.length > 0) break;
      }
    } catch (e) {
      if (alive.current && generation === sessionGeneration()) setError(e);
    } finally {
      busy.current = false;
      if (alive.current) setLoading(false);
    }
  }, [id, valid]);

  useEffect(() => {
    alive.current = true;
    loadMore();
    return () => {
      alive.current = false;
    };
  }, [loadMore]);

  // 최신순으로 정렬해 날짜마다 머리글 한 줄을 끼운다.
  const rows: Row[] = [];
  let last = "";
  [...items]
    .sort((a, b) => (a.occurredAt < b.occurredAt ? 1 : -1))
    .forEach((tx) => {
      const date = toSeoulInput(tx.occurredAt).slice(0, 10);
      if (date !== last) {
        rows.push({ kind: "date", key: `d:${date}`, date });
        last = date;
      }
      rows.push({ kind: "tx", key: `t:${tx.id}`, tx });
    });

  return (
    <View style={{ flex: 1, backgroundColor: colors.bg }}>
      <SubHeader title={name || "카테고리 거래내역"} fallback="/analysis" />
      {!valid ? (
        <T style={{ padding: 20 }}>카테고리를 다시 선택해 주세요</T>
      ) : (
        <FlatList
          data={rows}
          keyExtractor={(row) => row.key}
          contentContainerStyle={{ padding: 20, paddingBottom: 40 }}
          onEndReachedThreshold={0.4}
          onEndReached={() => {
            if (!done && !error) loadMore();
          }}
          renderItem={({ item: row }) =>
            row.kind === "date" ? (
              <T
                size={13}
                weight="700"
                style={{ paddingTop: 18, paddingBottom: 6 }}
              >
                {row.date === seoulDate() ? "오늘" : row.date}
              </T>
            ) : (
              <TxRow tx={row.tx} />
            )
          }
          ListHeaderComponent={<ErrorNotice error={error} retry={loadMore} />}
          ListEmptyComponent={
            !done ? (
              error ? null : (
                <Loading />
              )
            ) : (
              <T style={{ paddingVertical: 24, textAlign: "center" }}>
                이 카테고리에 등록된 거래내역이 없어요
              </T>
            )
          }
          ListFooterComponent={
            loading && rows.length > 0 ? (
              <ActivityIndicator
                color={colors.brand}
                style={{ paddingVertical: 20 }}
              />
            ) : done && rows.length > 0 ? (
              <T
                size={12}
                color={colors.textMuted}
                style={{ paddingVertical: 20, textAlign: "center" }}
              >
                모든 거래내역을 불러왔어요
              </T>
            ) : null
          }
        />
      )}
    </View>
  );
}

function TxRow({ tx }: { tx: Transaction }) {
  const category = tx.category ?? {
    name: "카테고리 없음",
    icon: "pricetag",
    color: colors.textMuted,
  };
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`${tx.title}, ${money(tx.amount)}원, 상세 보기`}
      onPress={() => router.push(`/transactions/${tx.id}`)}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
        paddingHorizontal: 16,
        marginBottom: 2,
        backgroundColor: colors.card,
        borderRadius: 16,
      }}
    >
      <View
        style={{
          width: 40,
          height: 40,
          borderRadius: 20,
          alignItems: "center",
          justifyContent: "center",
          backgroundColor: category.color + "1F",
        }}
      >
        <CategoryIcon icon={category.icon} color={category.color} />
      </View>
      <View style={{ flex: 1, gap: 3 }}>
        <T weight="600" numberOfLines={1}>
          {tx.title}
        </T>
        <T size={12} color={colors.textMuted}>
          {category.name}
        </T>
      </View>
      <T weight="700" color={tx.type === "INCOME" ? colors.brand : colors.text}>
        {tx.type === "INCOME" ? "+" : "-"}
        {money(tx.amount)}원
      </T>
    </Pressable>
  );
}
