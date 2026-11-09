import { CoinIcon } from "@/real/components/CoinIcon";
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
import { LevelGuide } from "./LevelGuide";
import { AttendanceModal } from "./AttendanceModal";
import { HomeGuide, useHomeGuide } from "./HomeGuide";
import { WeekExpensesSheet } from "./WeekExpensesSheet";
import { OutfitView } from "./OutfitView";
import { RewardModal } from "./RewardModal";
import { sessionGeneration } from "./api/client";
import { ackRewards, checkIn, getAttendance } from "./coinApi";
import { levelName } from "@/real/components/LevelIcon";
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
  // 첫 check-in이 끝나야 가입 선물·출석 모달을 띄울지 알 수 있다. 첫 홈 가이드는 그 뒤에 띄운다
  const [checkedIn, setCheckedIn] = useState(false);
  const guide = useHomeGuide();
  // 자동 출석 모달은 하루(서버 날짜)에 한 번만 연다. 실패하거나 닫아도 같은 날 또 띄우지 않는다.
  const autoDay = useRef<string | null>(null);
  // Opening or returning to the home runs check-in; the coin chip reads the wallet it returns.
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
      .then(() => getAttendance())
      .then((a) => {
        // 자정이 지난 뒤 처음 열었으면 출석 모달이 열려 출석을 자동으로 처리한다
        if (a.checkedToday || autoDay.current === a.today) return;
        autoDay.current = a.today;
        setAttendance(true);
      })
      .catch(() => {})
      .finally(() => {
        checking.current = false;
        setCheckedIn(true);
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
                // Android의 영상 뷰(네이티브)가 터치를 먹어 Pressable로 감싸면 눌러도 반응이 없었다.
                // 영상은 터치를 받지 않게 하고, 그 위에 투명한 Pressable을 따로 덮는다.
                <View style={{ flex: 1 }}>
                  <OutfitView
                    outfitId={wallet?.equippedOutfitId ?? null}
                    style={{ flex: 1 }}
                    accessibilityLabel={`${levelName(status.level)} 단계 캐릭터`}
                  />
                  <Pressable
                    accessibilityRole="button"
                    accessibilityLabel={`${levelName(status.level)} 단계 캐릭터, 상점 열기`}
                    onPress={() => router.push("/customize")}
                    style={StyleSheet.absoluteFill}
                  />
                </View>
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
              dayPlans={s.dayPlans}
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
              <ScrollView>
                <LevelGuide />
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
      <HomeGuide
        visible={
          guide.pending && checkedIn && !shownReward && !attendance && !!s
        }
        onDone={guide.finish}
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
// Mirrors the server rule in docs/policies.md §4: attending adds 10, a kept day adds 20, an overspent day takes 50, within 0-500.
// The home screen shows after the attendance modal, so the hint counts today's attendance: kept 10+20, overspent 10-50.
const UP = 30;
const DOWN = 40;
const MAX = 500;
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
/** Coin balance floating over the character video; it opens the coin history, where [모으기] is. */
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
        <CoinIcon size={14} />{money(balance)}
      </T>
    </Pressable>
  );
}
