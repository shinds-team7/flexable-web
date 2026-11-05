import { CoinIcon } from "@/real/components/CoinIcon";
import Ionicons from "@expo/vector-icons/Ionicons";
import { useEffect, useRef, useState } from "react";
import { Animated, Easing, Image, Platform, StyleSheet, View } from "react-native";
import { Modal } from "@/components/PhoneModal";
import { Button, T, useAnimValue, useReducedMotion } from "@/real/components/ui";
import { colors, floating } from "@/real/theme";
import { sessionGeneration } from "./api/client";
import { attend } from "./coinApi";
import { outfitSource } from "./outfits";
import type { Attendance, CoinReward } from "./types";
import { ErrorNotice, Loading, useResource } from "./ui";
import { publishWallet } from "./wallet";

const CYCLE = 7;
/** 보상이 있는 날(그 주기 안의 순서). 3일차는 코인, 7일차는 첫 주기에만 코스튬 */
const COIN_DAY = 3;
const COSTUME_DAY = 7;
const MILESTONE_COIN = 50;
/** 원의 지름은 줄 폭을 7칸으로 나눈 값에 맞춰 줄어들고 이 크기를 넘지 않는다. 폭·높이를 같은 숫자로 줘야 정확한 원이다 */
const CIRCLE_MAX = 38;
const CIRCLE_MIN = 24;
const TRACK_PAD = 6;
const GOLD = "#E3A600";
const GOLD_SOFT = "#FFF6D6";
const GOLD_TEXT = "#B07F00";
/** 모달이 열린 뒤 자동 출석까지 기다리는 시간. 원 일곱 개가 먼저 보이게 한다 */
const AUTO_DELAY = 700;

/**
 * 출석 모달. 자정이 지난 뒤 처음 홈에 오면 홈이 자동으로 열고, 열리면 오늘 출석을 자동으로 처리한다
 * (홈 캐릭터 오른쪽 위 달력 버튼으로도 열 수 있다. 자동 출석이 실패하면 [출석하기]로 다시 한다).
 * 누적 일수·보상은 서버 값만 보여 준다(docs/coin-plan.md §1 출석). 어제 예산을 지킨 보너스가 있으면 같은 모달의 설명 줄에 함께 보여 준다.
 */
export function AttendanceModal({
  visible,
  budgetBonus,
  onClose,
}: {
  visible: boolean;
  /** 아직 확인하지 않은 "어제 예산을 지킴" 보상. 닫을 때 부르는 쪽이 확인 처리한다 */
  budgetBonus: CoinReward | null;
  onClose: () => void;
}) {
  const result = useResource<Attendance>(visible ? "/coins/attendance" : null);
  // 출석한 뒤에는 응답의 출석 현황을 보여 준다. 다시 열면 서버에서 새로 읽는다.
  const [after, setAfter] = useState<{
    attendance: Attendance;
    rewarded: number;
    outfitId: string | null;
  }>();
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<unknown>();
  // 열릴 때마다 자동 출석은 한 번만 시도한다(실패하면 [출석하기]로 사용자가 다시 한다)
  const autoTried = useRef(false);
  const close = () => {
    autoTried.current = false;
    setAfter(undefined);
    setError(undefined);
    onClose();
  };
  const a = after?.attendance ?? result.data;
  const check = () => {
    setBusy(true);
    setError(undefined);
    const generation = sessionGeneration();
    attend()
      .then((r) => {
        publishWallet(r.wallet, generation);
        setAfter({
          attendance: r.attendance,
          rewarded: r.rewarded,
          outfitId: r.outfitId,
        });
      })
      .catch(setError)
      .finally(() => setBusy(false));
  };
  const pending = visible && !!a && !a.checkedToday;
  useEffect(() => {
    if (!pending || autoTried.current) return;
    autoTried.current = true;
    const timer = setTimeout(check, AUTO_DELAY);
    return () => clearTimeout(timer);
  }, [pending]);
  return (
    <Modal
      visible={visible}
      transparent
      animationType="fade"
      onRequestClose={close}
    >
      <View style={styles.dim}>
        <View style={[styles.dialog, floating]} accessibilityViewIsModal>
          {result.loading && !a && <Loading />}
          <ErrorNotice error={!a && result.error} retry={result.retry} />
          {a && (
            <AttendanceBody
              attendance={a}
              rewarded={after?.rewarded}
              outfitId={after?.outfitId ?? null}
              budgetBonus={budgetBonus}
              justChecked={!!after && after.rewarded > 0}
            />
          )}
          <ErrorNotice error={error} />
          {a ? (
            <Button
              label={
                a.checkedToday ? "확인" : busy ? "출석하는 중…" : "출석하기"
              }
              onPress={a.checkedToday ? close : check}
              disabled={busy}
              style={{ marginTop: 20 }}
            />
          ) : (
            <Button label="닫기" onPress={close} style={{ marginTop: 20 }} />
          )}
        </View>
      </View>
    </Modal>
  );
}

function AttendanceBody({
  attendance: a,
  rewarded,
  outfitId,
  budgetBonus,
  justChecked,
}: {
  attendance: Attendance;
  /** 방금 출석해서 받은 코인. 모달을 다시 열었을 때는 undefined */
  rewarded?: number;
  outfitId: string | null;
  budgetBonus: CoinReward | null;
  /** 이 모달에서 방금 출석했다. 그날 원이 커졌다 한 바퀴 돌고 돌아오는 움직임을 보여 준다 */
  justChecked: boolean;
}) {
  const [trackWidth, setTrackWidth] = useState(0);
  // 칸 일곱이 폭을 나눠 가지므로, 지름을 칸 폭보다 조금 작게 잡아 원끼리 겹치지 않게 한다
  const size = Math.max(
    CIRCLE_MIN,
    Math.min(CIRCLE_MAX, Math.floor((trackWidth - TRACK_PAD * 2) / CYCLE) - 4),
  );
  const done = a.checkedToday ? ((a.total - 1) % CYCLE) + 1 : a.total % CYCLE;
  // 7일차 코스튬은 처음 7일에만 있다. 8일째부터는 7일차도 코인이다
  const firstCycle = (a.checkedToday ? a.total : a.total + 1) <= CYCLE;
  const title = a.checkedToday
    ? a.total === 1
      ? "1번째 출석 시작"
      : `${a.total}번째 출석`
    : "오늘 출석하기";
  return (
    <View style={{ alignItems: "center" }}>
      <View
        style={[
          styles.big,
          !a.checkedToday && { backgroundColor: colors.brandSoft },
        ]}
      >
        <Ionicons
          name={a.checkedToday ? "checkmark" : "calendar-outline"}
          size={a.checkedToday ? 46 : 38}
          color={a.checkedToday ? colors.onBrand : colors.brand}
        />
      </View>
      <T
        size={24}
        weight="800"
        color={colors.brand}
        accessibilityRole="header"
        style={{ marginTop: 16, textAlign: "center" }}
      >
        {title}
      </T>
      <View style={{ marginTop: 8, gap: 2, alignItems: "center" }}>
        {budgetBonus && (
          <T size={15} style={{ textAlign: "center", lineHeight: 23 }}>
            어제 예산을 지켰어요{" "}
            <T size={15} weight="800" color={colors.brandDark} num>
              +{budgetBonus.amount} <CoinIcon size={14} />
            </T>
          </T>
        )}
        {rewarded !== undefined && rewarded > 0 && (
          <T size={15} style={{ textAlign: "center", lineHeight: 23 }}>
            출석 보상{" "}
            <T size={15} weight="800" color={colors.brandDark} num>
              +{rewarded} <CoinIcon size={14} />
            </T>
          </T>
        )}
        {outfitId && (
          <T size={15} style={{ textAlign: "center", lineHeight: 23 }}>
            7일차 코스튬을 받았어요
          </T>
        )}
        {!a.checkedToday && (
          <T
            size={15}
            color={colors.textSub}
            style={{ textAlign: "center", lineHeight: 23 }}
          >
            오늘 출석하면{" "}
            <T size={15} weight="800" color={colors.brandDark} num>
              +{a.todayReward} <CoinIcon size={14} />
            </T>
            {a.todayOutfitId ? " 와 코스튬" : ""}
          </T>
        )}
        {a.checkedToday && rewarded === undefined && (
          <T size={15} color={colors.textSub} style={{ textAlign: "center" }}>
            오늘 출석을 마쳤어요
          </T>
        )}
      </View>
      <View
        style={styles.track}
        onLayout={(e) => setTrackWidth(e.nativeEvent.layout.width)}
      >
        {Array.from({ length: CYCLE }, (_, i) => i + 1).map((day) => (
          <DayCircle
            key={day}
            day={day}
            size={size}
            on={day <= done}
            next={!a.checkedToday && day === done + 1}
            pulse={justChecked && a.checkedToday && day === done}
            firstCycle={firstCycle}
          />
        ))}
      </View>
    </View>
  );
}

function DayCircle({
  day,
  size,
  on,
  next,
  pulse,
  firstCycle,
}: {
  day: number;
  size: number;
  on: boolean;
  next: boolean;
  pulse: boolean;
  firstCycle: boolean;
}) {
  const costume = day === COSTUME_DAY && firstCycle;
  const coin = day === COIN_DAY || (day === COSTUME_DAY && !firstCycle);
  const reduced = useReducedMotion();
  const scale = useAnimValue(1);
  const turn = useAnimValue(0);
  // 방금 출석한 날의 원: 부드럽게 커지고(강조) 한 바퀴 돈 뒤 원래 크기로 돌아온다
  useEffect(() => {
    if (!pulse || reduced) return;
    const native = Platform.OS !== "web";
    scale.setValue(1);
    turn.setValue(0);
    const animation = Animated.parallel([
      Animated.sequence([
        Animated.timing(scale, {
          toValue: 1.55,
          duration: 280,
          easing: Easing.out(Easing.cubic),
          useNativeDriver: native,
        }),
        Animated.delay(620),
        Animated.timing(scale, {
          toValue: 1,
          duration: 320,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: native,
        }),
      ]),
      Animated.sequence([
        Animated.delay(280),
        Animated.timing(turn, {
          toValue: 1,
          duration: 620,
          easing: Easing.inOut(Easing.cubic),
          useNativeDriver: native,
        }),
      ]),
    ]);
    animation.start();
    return () => animation.stop();
  }, [pulse, reduced, scale, turn]);
  const rotate = turn.interpolate({
    inputRange: [0, 1],
    outputRange: ["0deg", "360deg"],
  });
  // 보상이 있는 날은 금색 테두리(코스튬 날은 옅은 금색 바탕). 출석하면 파란 원으로 채운다
  const gold = (costume || coin) && !on;
  return (
    <View
      style={styles.col}
      accessible
      accessibilityLabel={`${day}일차${on ? ", 출석" : ""}${costume ? ", 코스튬 보상" : ""}${coin ? `, ${MILESTONE_COIN}코인 보상` : ""}`}
    >
      <T
        size={11}
        weight="700"
        color={on || next ? colors.textMuted : colors.textFaint}
      >
        {day}일차
      </T>
      <Animated.View
        style={[
          styles.circle,
          {
            width: size,
            height: size,
            borderRadius: size / 2,
            zIndex: pulse ? 1 : 0,
            transform: [{ scale }, { rotate }],
          },
          on && styles.on,
          next && styles.next,
          gold && styles.gold,
          costume && !on && styles.costume,
        ]}
      >
        {on ? (
          <Ionicons
            name="checkmark"
            size={Math.round(size * 0.5)}
            color={colors.onBrand}
          />
        ) : costume ? (
          <Image source={outfitSource("outfit-07")} style={styles.costumeImg} />
        ) : coin ? (
          <T size={11} weight="800" color={GOLD_TEXT} num>
            +{MILESTONE_COIN}
          </T>
        ) : null}
      </Animated.View>
    </View>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  dialog: { backgroundColor: "#fff", borderRadius: 24, padding: 22 },
  big: {
    width: 84,
    height: 84,
    borderRadius: 42,
    backgroundColor: colors.brand,
    alignItems: "center",
    justifyContent: "center",
  },
  track: {
    alignSelf: "stretch",
    flexDirection: "row",
    marginTop: 20,
    paddingVertical: 14,
    paddingHorizontal: TRACK_PAD,
    borderRadius: 18,
    backgroundColor: colors.sunken,
  },
  col: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 6,
  },
  circle: {
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  on: { backgroundColor: colors.brand },
  next: { borderWidth: 2, borderColor: colors.brand },
  gold: { borderWidth: 2, borderColor: GOLD },
  costume: { backgroundColor: GOLD_SOFT },
  costumeImg: { width: "100%", height: "100%" },
});
