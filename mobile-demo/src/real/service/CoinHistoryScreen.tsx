import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useRef, useState } from "react";
import { StyleSheet, View } from "react-native";
import { Button, Card, Screen, T } from "@/real/components/ui";
import { SubHeader } from "@/real/components/SubHeader";
import { colors } from "@/real/theme";
import { sessionGeneration } from "./api/client";
import { getLedger } from "./coinApi";
import { ledgerDetail, ledgerTitle } from "./coinLedger";
import type { CoinLedgerEntry, CoinLedgerPage, CoinWallet } from "./types";
import {
  ErrorNotice,
  Loading,
  money,
  seoulDate,
  toSeoulInput,
  useResource,
} from "./ui";

/** 코인 적립·사용 내역. 홈 캐릭터 영상 위 코인 칩에서 들어온다(GET /coins/ledger, 최신순). 보유 코인 옆 버튼으로 상점에 간다. */
export function CoinHistoryScreen() {
  const first = useResource<CoinLedgerPage>("/coins/ledger");
  const wallet = useResource<CoinWallet>("/coins");
  // Older pages hang off the first page they were read after; a refetched first page starts over.
  const [older, setOlder] = useState<{
    base: CoinLedgerPage;
    page: CoinLedgerPage;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  const lock = useRef(false);

  const base = first.data;
  const extra = base && older?.base === base ? older.page : undefined;
  const items = [...(base?.items ?? []), ...(extra?.items ?? [])];
  const nextBefore = extra ? extra.nextBefore : base?.nextBefore;

  const loadMore = async () => {
    if (lock.current || !base || nextBefore == null) return;
    lock.current = true;
    const generation = sessionGeneration();
    setBusy(true);
    setError(undefined);
    try {
      const page = await getLedger(nextBefore);
      if (generation !== sessionGeneration()) return;
      setOlder({
        base,
        page: {
          items: [...(extra?.items ?? []), ...page.items],
          nextBefore: page.nextBefore,
        },
      });
    } catch (e) {
      if (generation === sessionGeneration()) setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const groups = new Map<string, CoinLedgerEntry[]>();
  items.forEach((e) => {
    const d = toSeoulInput(e.createdAt).slice(0, 10);
    groups.set(d, [...(groups.get(d) ?? []), e]);
  });

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="코인 내역" fallback="/home" />
      <Screen>
        {wallet.data && (
          <View style={styles.top}>
            <Card style={{ flex: 1 }}>
              <T size={13} color={colors.textSub}>
                보유 코인
              </T>
              <View
                accessible
                accessibilityLabel={`보유 코인 ${wallet.data.balance}개`}
              >
                <T size={24} weight="800" num>
                  🪙 {money(wallet.data.balance)}
                </T>
              </View>
            </Card>
            <Card
              style={styles.shop}
              accessibilityLabel="상점"
              onPress={() => router.push("/customize")}
            >
              <Ionicons name="storefront-outline" size={24} color={colors.text} />
              <T size={13} weight="700">
                상점
              </T>
              {wallet.data.passive.collectable > 0 && (
                <View style={styles.dot} />
              )}
            </Card>
          </View>
        )}
        <ErrorNotice error={first.error} retry={first.retry} />
        {first.loading && !base ? (
          <Loading />
        ) : (
          base && (
            <Card style={{ paddingVertical: 8 }}>
              {groups.size === 0 && (
                <T style={{ paddingVertical: 24, textAlign: "center" }}>
                  코인 내역이 없어요
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
                  {list.map((e) => (
                    <Row key={e.id} entry={e} />
                  ))}
                </View>
              ))}
            </Card>
          )
        )}
        <ErrorNotice error={error} retry={loadMore} />
        {nextBefore != null && (
          <Button
            label="더 보기"
            variant="soft"
            disabled={busy}
            onPress={loadMore}
          />
        )}
      </Screen>
    </View>
  );
}

function Row({ entry }: { entry: CoinLedgerEntry }) {
  const title = ledgerTitle(entry);
  const detail = ledgerDetail(entry);
  const time = toSeoulInput(entry.createdAt).slice(11, 16);
  return (
    <View
      accessible
      accessibilityLabel={[title, detail, time].filter(Boolean).join(", ")}
      style={{
        flexDirection: "row",
        alignItems: "center",
        gap: 12,
        paddingVertical: 12,
      }}
    >
      <View style={{ flex: 1, gap: 3 }}>
        <T
          weight="700"
          num
          color={entry.amount < 0 ? colors.text : colors.brand}
        >
          {title}
        </T>
        {detail !== "" && (
          <T size={12} color={colors.textMuted}>
            {detail}
          </T>
        )}
      </View>
      <T size={12} color={colors.textMuted} num>
        {time}
      </T>
    </View>
  );
}

const styles = StyleSheet.create({
  top: { flexDirection: "row", gap: 12 },
  // The dot says coins are waiting to be collected in the shop.
  shop: { alignItems: "center", justifyContent: "center", gap: 4, paddingHorizontal: 24 },
  dot: {
    position: "absolute",
    top: 12,
    right: 14,
    width: 9,
    height: 9,
    borderRadius: 5,
    borderWidth: 1.5,
    borderColor: "#fff",
    backgroundColor: colors.danger,
  },
});
