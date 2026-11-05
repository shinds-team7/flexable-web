import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useRef, useState } from "react";
import { Image, Pressable, StyleSheet, View } from "react-native";
import { Button, Card, Screen, T } from "@/real/components/ui";
import { SubHeader } from "@/real/components/SubHeader";
import { levelLabel, levelName } from "@/real/components/LevelIcon";
import { colors, radius } from "@/real/theme";
import { sessionGeneration } from "./api/client";
import {
  demoUnlockOutfit,
  equipOutfit,
  getOutfits,
  getWallet,
  purchaseOutfit,
} from "./coinApi";
import { DemoLock } from "./DemoUnlock";
import { useToast } from "@/real/components/Toast";
import { AdRewardCard } from "./AdRewardCard";
import { showRewardedAd } from "./adReward";
import { useSession } from "./Session";
import { DEFAULT_OUTFIT_ID } from "./outfits";
import { OutfitView } from "./OutfitView";
import { PurchaseModal } from "./PurchaseModal";
import type { Outfit, OutfitList } from "./types";
import { ErrorNotice, Loading, money } from "./ui";
import { publishWallet, useWallet } from "./wallet";

// 레벨 코스튬은 6단계(광부·마구간지기·상인·기사·귀족·왕족)다. 디자인 중이라 서버가 아직 내려 주지 않는 칸은
// cat-unlock 실루엣과 자물쇠로 채운다.
const LEVEL_SLOTS = 6;
const UNLOCK_CAT = require("../../../assets/real/outfits/cat-unlock.png");

export function CustomizeScreen() {
  const [list, setList] = useState<OutfitList>();
  const [loadError, setLoadError] = useState<unknown>();
  const [error, setError] = useState<unknown>();
  const [selected, setSelected] = useState<string>();
  const [bought, setBought] = useState<Outfit | null>(null);
  const [busy, setBusy] = useState(false);
  // 시연: 해금 연출 중인 레벨 코스튬 id
  const [breaking, setBreaking] = useState<string | null>(null);
  const toast = useToast();
  const wallet = useWallet();
  const { user } = useSession();
  const [adMessage, setAdMessage] = useState("");
  const lock = useRef(false);
  const focus = useRef(0);

  const load = useCallback(() => {
    const seq = ++focus.current;
    const generation = sessionGeneration();
    setLoadError(undefined);
    // Only the ad button needs the wallet; without it the shop still works from the outfit list.
    getWallet()
      .then((w) => publishWallet(w, generation))
      .catch(() => {});
    getOutfits()
      .then((data) => {
        if (seq !== focus.current || generation !== sessionGeneration()) return;
        setList(data);
        // 처음에는 적용 중인 코스튬을 미리보기로 보여 준다
        setSelected(
          (prev) =>
            prev ?? data.items.find((o) => o.equipped)?.id ?? DEFAULT_OUTFIT_ID,
        );
      })
      .catch((e) => {
        if (seq === focus.current && generation === sessionGeneration())
          setLoadError(e);
      });
  }, []);
  useFocusEffect(
    useCallback(() => {
      load();
      return () => {
        ++focus.current;
      };
    }, [load]),
  );

  const run = async (action: () => Promise<void>) => {
    if (lock.current) return;
    lock.current = true;
    const started = focus.current;
    const generation = sessionGeneration();
    setBusy(true);
    setError(undefined);
    try {
      await action();
    } catch (e) {
      if (started === focus.current && generation === sessionGeneration())
        setError(e);
    } finally {
      lock.current = false;
      setBusy(false);
    }
  };

  const current = list?.items.find((o) => o.id === selected);
  const levels = list?.items.filter((o) => o.unlockLevel !== null) ?? [];
  // The outfit list carries the balance shown here; the shared wallet follows so the home and header stay in step.
  const buy = (outfit: Outfit) =>
    run(async () => {
      const generation = sessionGeneration();
      const next = await purchaseOutfit(outfit.id);
      setList(next);
      if (wallet)
        publishWallet({ ...wallet, balance: next.balance }, generation);
      setBought(outfit);
    });
  // 시연 전용: 레벨이 모자라도 무료로 연다. 자물쇠가 깨지는 연출이 끝나면 목록을 바꾼다
  const unlocked = useRef<OutfitList | null>(null);
  const unlock = (outfit: Outfit) =>
    run(async () => {
      unlocked.current = null;
      setBreaking(outfit.id);
      unlocked.current = await demoUnlockOutfit(outfit.id);
    });
  const broken = () => {
    const next = unlocked.current;
    setBreaking(null);
    if (next) setList(next);
    else load();
    toast("코스튬을 해금했어요");
  };
  // 보상은 구글 검증 콜백이 서버에서 지급하므로, 광고를 본 뒤 지갑을 다시 읽어 늘었는지 확인한다(몇 초 걸릴 수 있다).
  const watchAd = () =>
    run(async () => {
      if (!user) return;
      setAdMessage("");
      const generation = sessionGeneration();
      const before = wallet?.ad.rewardedToday ?? 0;
      const result = await showRewardedAd(user.id);
      if (result === "failed") {
        setAdMessage("광고를 불러오지 못했어요. 잠시 후 다시 시도해 주세요");
        return;
      }
      if (result === "closed") {
        setAdMessage("광고를 끝까지 봐야 코인을 받아요");
        return;
      }
      for (let i = 0; i < 8; i++) {
        const w = await getWallet();
        publishWallet(w, generation);
        if (w.ad.rewardedToday > before) {
          setList((l) => l && { ...l, balance: w.balance });
          return;
        }
        await new Promise((r) => setTimeout(r, 1500));
      }
      setAdMessage("코인 지급이 조금 늦어지고 있어요. 잠시 후 다시 확인해 주세요");
    });
  const apply = (id: string) =>
    run(async () => {
      const generation = sessionGeneration();
      const next = await equipOutfit(id);
      if (wallet)
        publishWallet(
          { ...wallet, equippedOutfitId: next.equippedOutfitId },
          generation,
        );
      setBought(null);
      // 홈은 돌아올 때 다시 불러 새 코스튬을 보여 준다. 상점 아래 코인 내역까지 걷어 내고 홈으로 간다
      router.dismissTo("/home");
    });

  return (
    <View style={{ flex: 1 }}>
      <SubHeader title="상점" fallback="/home" />
      <Screen>
        <ErrorNotice error={loadError} retry={load} />
        {!list && !loadError && <Loading />}
        {list && selected && (
          <>
            <AdRewardCard
              balance={list.balance}
              wallet={wallet}
              busy={busy}
              message={adMessage}
              onWatch={watchAd}
            />
            <Card style={{ alignItems: "center", gap: 12 }}>
              <OutfitView
                outfitId={selected}
                accessibilityLabel={`${current?.name ?? "캐릭터"} 미리보기`}
                style={{
                  width: "100%",
                  aspectRatio: 16 / 9,
                  borderRadius: radius.soft,
                  overflow: "hidden",
                  backgroundColor: colors.stage,
                }}
              />
              {current &&
                current.unlockLevel !== null &&
                (!current.owned || breaking === current.id) && (
                  <View
                    pointerEvents="none"
                    style={{
                      position: "absolute",
                      top: 20,
                      left: 20,
                      right: 20,
                      aspectRatio: 16 / 9,
                    }}
                  >
                    <DemoLock
                      key={current.id}
                      breaking={breaking === current.id}
                      onBroken={broken}
                    />
                  </View>
                )}
              {current && (
                <Action
                  outfit={current}
                  balance={list.balance}
                  busy={busy || breaking !== null}
                  onBuy={() => buy(current)}
                  onApply={() => apply(current.id)}
                  onUnlock={() => unlock(current)}
                />
              )}
            </Card>
            <ErrorNotice error={error} />
            <T size={14} weight="700" color={colors.textSub}>
              레벨 코스튬
            </T>
            <Grid
              items={levels}
              selected={selected}
              onSelect={setSelected}
              empty={Math.max(0, LEVEL_SLOTS - levels.length)}
              emptyFrom={levels.length + 1}
            />
            <T size={14} weight="700" color={colors.textSub}>
              코인 코스튬
            </T>
            {list.items.some((o) => o.unlockLevel === null) ? (
              <Grid
                items={list.items.filter((o) => o.unlockLevel === null)}
                selected={selected}
                onSelect={setSelected}
              />
            ) : (
              <Card>
                <T color={colors.textMuted}>곧 새 코스튬이 나와요</T>
              </Card>
            )}
          </>
        )}
      </Screen>
      <PurchaseModal
        outfit={bought}
        busy={busy}
        onApply={() => bought && apply(bought.id)}
        onClose={() => setBought(null)}
      />
    </View>
  );
}

function Action({
  outfit,
  balance,
  busy,
  onBuy,
  onApply,
  onUnlock,
}: {
  outfit: Outfit;
  balance: number;
  busy: boolean;
  onBuy: () => void;
  onApply: () => void;
  onUnlock: () => void;
}) {
  const stretch = { alignSelf: "stretch" } as const;
  if (outfit.equipped)
    return <Button label="적용 중" variant="soft" disabled style={stretch} />;
  if (outfit.owned)
    return (
      <Button
        label="적용하기"
        disabled={busy}
        onPress={onApply}
        style={stretch}
      />
    );
  // 시연: 실제 앱의 '달성 시 열림' 대신 바로 여는 [해금하기]
  if (outfit.unlockLevel !== null)
    return (
      <View style={{ alignSelf: "stretch", gap: 6 }}>
        <Button
          label={busy ? "해금하는 중…" : "해금하기"}
          icon="lock-open"
          disabled={busy}
          onPress={onUnlock}
          style={stretch}
        />
        <T size={12} color={colors.textMuted} style={{ textAlign: "center" }}>
          실제 앱에서는 {levelLabel(outfit.unlockLevel)}을 달성하면 열려요. 시연에서는 바로 무료로 열어요
        </T>
      </View>
    );
  const price = outfit.price ?? 0;
  return (
    <Button
      label={`${money(price)}코인으로 구매`}
      disabled={busy || price > balance}
      onPress={onBuy}
      style={stretch}
    />
  );
}

/** 가지지 않은 코스튬(잠긴 레벨·안 산 상품)은 그림을 어둡게 덮고 자물쇠를 띄운다. empty 는 뒤에 붙일 준비 중 칸 수 */
function Grid({
  items,
  selected,
  onSelect,
  empty = 0,
  emptyFrom = 1,
}: {
  items: Outfit[];
  selected: string;
  onSelect: (id: string) => void;
  empty?: number;
  /** 첫 준비 중 칸의 레벨(이름을 붙인다) */
  emptyFrom?: number;
}) {
  return (
    <View style={grid.wrap}>
      {items.map((o) => {
        const on = o.id === selected;
        const caption = o.equipped
          ? "적용 중"
          : o.owned
            ? "보유 중"
            : o.unlockLevel === null
              ? `${money(o.price ?? 0)} 코인`
              : levelLabel(o.unlockLevel);
        return (
          <Pressable
            key={o.id}
            accessibilityRole="button"
            accessibilityLabel={o.name}
            accessibilityState={{ selected: on }}
            onPress={() => onSelect(o.id)}
            style={[grid.cell, on && grid.on]}
          >
            <View style={grid.thumbBox}>
              <OutfitView outfitId={o.id} play={false} style={grid.thumb} />
              {!o.owned && (
                <View style={[StyleSheet.absoluteFill, grid.shade]}>
                  <Ionicons name="lock-closed" size={18} color="#fff" />
                </View>
              )}
            </View>
            <T size={12} color={colors.textMuted}>
              {caption}
            </T>
          </Pressable>
        );
      })}
      {Array.from({ length: empty }, (_, i) => (
        <View
          key={`empty-${i}`}
          accessible
          accessibilityLabel={`${levelName(emptyFrom + i)} 코스튬, 준비 중`}
          style={grid.cell}
        >
          <View style={[grid.thumb, grid.center]}>
            <Image
              source={UNLOCK_CAT}
              resizeMode="contain"
              tintColor={colors.textFaint}
              style={grid.unlockCat}
            />
            <View style={[StyleSheet.absoluteFill, grid.center]}>
              <Ionicons name="lock-closed" size={18} color={colors.textMuted} />
            </View>
          </View>
          <T size={12} color={colors.textMuted}>
            {levelLabel(emptyFrom + i)}
          </T>
        </View>
      ))}
    </View>
  );
}

const grid = StyleSheet.create({
  wrap: { flexDirection: "row", flexWrap: "wrap", gap: 10 },
  cell: {
    width: "31%",
    padding: 10,
    gap: 6,
    alignItems: "center",
    borderRadius: radius.soft,
    backgroundColor: colors.card,
    borderWidth: 1,
    borderColor: colors.line,
  },
  on: {
    backgroundColor: colors.brandSoft,
    borderWidth: 2,
    borderColor: colors.brand,
  },
  thumbBox: { width: "100%" },
  thumb: {
    width: "100%",
    aspectRatio: 16 / 9,
    borderRadius: radius.soft,
    overflow: "hidden",
    backgroundColor: colors.stage,
  },
  shade: {
    alignItems: "center",
    justifyContent: "center",
    borderRadius: radius.soft,
    backgroundColor: "rgba(16, 24, 40, 0.32)",
  },
  center: { alignItems: "center", justifyContent: "center" },
  unlockCat: { width: "100%", height: "86%", opacity: 0.55 },
});
