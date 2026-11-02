import Ionicons from "@expo/vector-icons/Ionicons";
import { router, useFocusEffect } from "expo-router";
import { useCallback, useEffect, useRef, useState } from "react";
import {
  AppState,
  Pressable,
  ScrollView,
  StyleSheet,
  View,
} from "react-native";
import { Button, Card, Screen, Sheet, T } from "@/real/components/ui";
import {
  CharacterStage,
  pointsStatus,
  type PaceStatus,
} from "@/real/components/CharacterStage";
import { AttendanceModal } from "./AttendanceModal";
import { WeekExpensesSheet } from "./WeekExpensesSheet";
import { OutfitView } from "./OutfitView";
import { RewardModal } from "./RewardModal";
import { sessionGeneration } from "./api/client";
import { ackRewards, checkIn } from "./coinApi";
import { TodayHeroView } from "@/real/components/TodayHeroView";
import { colors } from "@/real/theme";
import { SeedMoneyCard } from "./SeedMoneyCard";
import { DayBudgets } from "@/real/components/DayBudgets";
import { SwipePager } from "@/real/components/SwipePager";
import { useSeedReminderSetting } from "./reminderSetting";
import { cancelSeedReminder, scheduleSeedReminder } from "./seedReminder";
import { ErrorNotice, Loading, money, useResource } from "./ui";
import type { CoinReward, SeedMoney, Today } from "./types";
import { publishWallet, useWallet } from "./wallet";
import { useServerExtensions } from "./serverExtensions";
export function HomeScreen() {
  const extensions = useServerExtensions();
  const result = useResource<Today>("/budget/today");
  // Seed money is the hero's second page, swiped in from the right.
  const seed = useResource<SeedMoney>("/budget/seed-money");
  const [basis, setBasis] = useState(false);
  const [attendance, setAttendance] = useState(false);
  const [levelHelp, setLevelHelp] = useState(false);
  const [week, setWeek] = useState(false);
  const [remind] = useSeedReminderSetting();
  const wallet = useWallet();
  const [rewards, setRewards] = useState<CoinReward[]>([]);
  const checking = useRef(false);
  // Opening or returning to the home runs check-in; the header shop button reads the wallet it returns.
  const runCheckIn = useCallback(() => {
    if (checking.current) return;
    checking.current = true;
    const generation = sessionGeneration();
    checkIn()
      .then((r) => {
        publishWallet(r.wallet, generation);
        if (r.rewards.length) {
          setRewards((q) => [
            ...q,
            ...r.rewards.filter((x) => !q.some((y) => y.id === x.id)),
          ]);
          // 어제 예산을 지킨 보너스는 따로 모달을 띄우지 않고 출석 모달에 합쳐 보여 준다
          if (r.rewards.some((x) => x.reason === "BUDGET_BONUS"))
            setAttendance(true);
        }
      })
      .catch(() => {})
      .finally(() => {
        checking.current = false;
      });
  }, []);
  useFocusEffect(runCheckIn);
  useEffect(() => {
    const sub = AppState.addEventListener("change", (state) => {
      if (state === "active") runCheckIn();
    });
    return () => sub.remove();
  }, [runCheckIn]);
  const budgetBonus = rewards.find((x) => x.reason === "BUDGET_BONUS") ?? null;
  const shownReward = rewards.find((x) => x.reason !== "BUDGET_BONUS") ?? null;
  const ackReward = (reward: CoinReward) => {
    setRewards((q) => q.filter((x) => x.id !== reward.id));
    ackRewards([reward.id]).catch(() => {});
  };
  const closeReward = () => {
    if (shownReward) ackReward(shownReward);
  };
  const closeAttendance = () => {
    setAttendance(false);
    if (budgetBonus) ackReward(budgetBonus);
  };
  const s = result.data;
  const status = s && statusOf(s);
  const nextPayday = s?.nextPayday;
  useEffect(() => {
    // 알림 예약이 실패해도 반영 창은 홈에서 뜨므로 조용히 넘긴다.
    if (!remind) cancelSeedReminder().catch(() => {});
    else if (nextPayday) scheduleSeedReminder(nextPayday).catch(() => {});
  }, [nextPayday, remind]);
  const hero = s && (
    <SwipePager>
      <TodayHeroView
        today={new Date(s.date + "T12:00:00")}
        summary={{
          todayAvailable: s.todayAvailable,
          daysLeft: s.daysLeft,
        }}
        footerCaption={`마지막 확인 ${result.confirmedAt?.toLocaleTimeString("ko-KR", { timeZone: "Asia/Seoul", hour: "2-digit", minute: "2-digit" }) ?? ""}`}
        onDetails={() => setBasis(true)}
        onOverHelp={() =>
          extensions.available
            ? router.push({
                pathname: "/chatbot",
                params: {
                  question:
                    "오늘 예산을 넘겼어요. 기록을 바탕으로 도움을 주세요",
                },
              })
            : setBasis(true)
        }
      />
      {seed.data && (
        <SeedMoneyCard
          seed={seed.data}
          style={{ flex: 1 }}
          onChanged={() => {
            seed.retry();
            result.retry();
          }}
        />
      )}
    </SwipePager>
  );
  return (
    <View style={{ flex: 1 }}>
      <Screen>
        {result.loading && !s && <Loading />}
        <ErrorNotice error={result.error} retry={result.retry} />
        {s && status && (
          <>
            <CharacterStage
              level={status.level}
              character={
                <OutfitView
                  outfitId={wallet?.equippedOutfitId ?? null}
                  style={{ flex: 1 }}
                  accessibilityLabel={`Lv.${status.level} 캐릭터`}
                />
              }
              coin={<CoinChip balance={wallet?.balance ?? 0} />}
              attendance={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="출석체크 열기"
                  onPress={() => setAttendance(true)}
                  hitSlop={8}
                  style={styles.calendar}
                >
                  <Ionicons
                    name="calendar-outline"
                    size={20}
                    color={colors.text}
                  />
                </Pressable>
              }
              gauge={status}
              help={
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel="레벨업 조건 및 가이드"
                  hitSlop={8}
                  onPress={() => setLevelHelp(true)}
                  style={{
                    flexDirection: "row",
                    alignItems: "center",
                    gap: 4,
                    minHeight: 40,
                  }}
                >
                  <T size={12}>레벨 안내</T>
                  <Ionicons
                    name="help-circle-outline"
                    size={20}
                    color={colors.textSub}
                  />
                </Pressable>
              }
            >
              {hero}
            </CharacterStage>
            <View style={styles.pair}>
              <Card
                style={[styles.half, s.weekAvailable < 0 && styles.navy]}
                onPress={() => setWeek(true)}
                accessibilityLabel="이번 주 일별 지출 내역 보기"
              >
                <T
                  size={13}
                  color={s.weekAvailable < 0 ? colors.onBrand : colors.textSub}
                >
                  이번 주 쓸 수 있는 돈
                </T>
                <T
                  size={20}
                  weight="800"
                  num
                  color={s.weekAvailable < 0 ? colors.onBrand : colors.text}
                >
                  {money(s.weekAvailable)}원
                </T>
                <T
                  size={12}
                  color={
                    s.weekAvailable < 0 ? colors.onBrandSub : colors.textMuted
                  }
                  num
                >
                  남은 {s.weekDaysLeft}일 · 이번 주 쓴 돈 {money(s.weekSpent)}원
                </T>
              </Card>
              <Card style={[styles.half, s.remaining < 0 && styles.navy]}>
                <T
                  size={13}
                  color={s.remaining < 0 ? colors.onBrand : colors.textSub}
                >
                  다음 수입일까지
                </T>
                <T
                  size={20}
                  weight="800"
                  num
                  color={s.remaining < 0 ? colors.onBrand : colors.text}
                >
                  {money(Math.max(0, s.remaining))}원
                </T>
                <T
                  size={12}
                  color={s.remaining < 0 ? colors.onBrandSub : colors.textMuted}
                >
                  남은 생활비
                </T>
              </Card>
            </View>
            <DayBudgets
              date={s.date}
              dayBudgets={s.dayBudgets}
              preset={s.dayPreset}
              onEdit={() => router.push("/budget/day-weights")}
            />
            {!s.hasTransactions && (
              <Card style={{ gap: 4 }}>
                <T weight="700">아직 기록한 거래가 없어요</T>
                <T size={13} color={colors.textMuted}>
                  아래 + 버튼으로 첫 거래를 기록해 보세요
                </T>
              </Card>
            )}
            <Sheet
              visible={levelHelp}
              onClose={() => setLevelHelp(false)}
              title="레벨업 조건 및 가이드"
            >
              <ScrollView contentContainerStyle={{ gap: 12 }}>
                <T>
                  하루 예산 이하로 쓰면 +15점, 넘으면 −50점이에요. 점수는
                  0~200점이며 오늘 결과는 내일 반영돼요
                </T>
                <T>Lv.1은 0~99점, Lv.2는 100~199점, Lv.3은 200점이에요</T>
                <T>
                  고정지출 자동 기록은 판정에서 제외해요. 앱을 열지 않은 날은
                  마지막으로 확인한 하루 예산을 기준으로 해요
                </T>
                <T>
                  한 번 달성한 레벨의 코스튬은 점수가 내려가도 해금 상태가
                  유지돼요
                </T>
              </ScrollView>
            </Sheet>
            <WeekExpensesSheet
              visible={week}
              date={s.date}
              onClose={() => setWeek(false)}
            />
            <Sheet
              visible={basis}
              onClose={() => setBasis(false)}
              title="오늘 예산의 계산 근거"
            >
              <ScrollView contentContainerStyle={{ gap: 12 }}>
                {[
                  ["추정 잔액", s.estimatedBalance],
                  ["남겨둘 고정지출", s.reservedFixed],
                  ["카드 미결제액", s.cardUnpaid],
                  ["매달 저축할 돈", s.protectedTotal],
                  ["오늘 쓴 돈", s.todaySpent],
                ].map(([label, n]) => (
                  <View
                    key={label}
                    style={{
                      flexDirection: "row",
                      justifyContent: "space-between",
                    }}
                  >
                    <T>{label}</T>
                    <T weight="700">{money(Number(n))}원</T>
                  </View>
                ))}
                <T size={13}>
                  입력한 잔액·기록 기준 추정으로, 실제 은행 잔액과 다를 수
                  있어요
                </T>
                <Button
                  label="예산 설정 수정"
                  onPress={() => {
                    setBasis(false);
                    router.push("/budget-settings");
                  }}
                />
              </ScrollView>
            </Sheet>
          </>
        )}
      </Screen>
      <RewardModal reward={shownReward} onClose={closeReward} />
      <AttendanceModal
        visible={attendance && !shownReward}
        budgetBonus={budgetBonus}
        onClose={closeAttendance}
      />
    </View>
  );
}
const styles = StyleSheet.create({
  pair: { flexDirection: "row", gap: 12 },
  half: { flex: 1, gap: 4, padding: 16 },
  // A negative amount turns the card navy, like the empty today card.
  navy: { backgroundColor: colors.text },
  coinChip: {
    flexDirection: "row",
    alignItems: "center",
    gap: 4,
    paddingHorizontal: 12,
    paddingVertical: 6,
    borderRadius: 16,
    backgroundColor: "rgba(255,255,255,0.9)",
  },
  calendar: {
    width: 36,
    height: 36,
    borderRadius: 18,
    alignItems: "center",
    justifyContent: "center",
    backgroundColor: "rgba(255,255,255,0.9)",
  },
});
// Mirrors the server rule in docs/API.md: a kept day adds 15 points, an overspent day takes 50, within 0-200 (Lv.3 for now).
const UP = 15;
const DOWN = 50;
const MAX = 200;
function statusOf(s: Today): PaceStatus {
  const points = Math.min(MAX, Math.max(0, s.characterPoints ?? 0));
  const delta = s.characterDelta ?? 0;
  const yesterday =
    delta > 0
      ? `어제 지켜서 +${delta}점`
      : delta < 0
        ? `어제 넘어서 ${delta}점`
        : null;
  const up = Math.min(UP, MAX - points);
  const down = Math.min(DOWN, points);
  const today =
    s.todaySpent <= s.dailyBudget
      ? up > 0
        ? `오늘 지키면 내일 +${up}점`
        : "오늘도 지키면 최고 단계 유지"
      : down > 0
        ? `오늘 예산을 넘어서 내일 -${down}점`
        : "오늘 예산을 넘었어요";
  return pointsStatus(points, yesterday ? `${yesterday} · ${today}` : today);
}
/** Coin balance floating over the character video; it opens the coin history, where the shop button sits. */
function CoinChip({ balance }: { balance: number }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityLabel={`보유 코인 ${money(balance)}개, 코인 내역 보기`}
      onPress={() => router.push("/coins/history")}
      hitSlop={8}
      style={styles.coinChip}
    >
      <T size={14} weight="800" num>
        🪙 {money(balance)}
      </T>
    </Pressable>
  );
}
