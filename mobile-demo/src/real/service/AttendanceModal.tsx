import Ionicons from "@expo/vector-icons/Ionicons";
import { useState } from "react";
import { Image, Modal, StyleSheet, View } from "react-native";
import { Button, T } from "@/real/components/ui";
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
/** 칸이 좁아도 원끼리 겹치지 않게, 칸 폭 안에서 줄어들고 이 크기를 넘지 않는다 */
const CIRCLE_MAX = 34;

/**
 * 출석 모달. 홈 캐릭터 오른쪽 위 달력 버튼으로 열고, [출석하기]를 눌러야 출석한다.
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
  const close = () => {
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
            />
          )}
          <ErrorNotice error={error} />
          {a ? (
            <Button
              label={a.checkedToday ? "확인" : "출석하기"}
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
}: {
  attendance: Attendance;
  /** 방금 출석해서 받은 코인. 모달을 다시 열었을 때는 undefined */
  rewarded?: number;
  outfitId: string | null;
  budgetBonus: CoinReward | null;
}) {
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
              +{budgetBonus.amount} 🪙
            </T>
          </T>
        )}
        {rewarded !== undefined && rewarded > 0 && (
          <T size={15} style={{ textAlign: "center", lineHeight: 23 }}>
            출석 보상{" "}
            <T size={15} weight="800" color={colors.brandDark} num>
              +{rewarded} 🪙
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
              +{a.todayReward} 🪙
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
      <View style={styles.track}>
        {Array.from({ length: CYCLE }, (_, i) => i + 1).map((day) => (
          <DayCircle
            key={day}
            day={day}
            on={day <= done}
            next={!a.checkedToday && day === done + 1}
            firstCycle={firstCycle}
          />
        ))}
      </View>
    </View>
  );
}

function DayCircle({
  day,
  on,
  next,
  firstCycle,
}: {
  day: number;
  on: boolean;
  next: boolean;
  firstCycle: boolean;
}) {
  const costume = day === COSTUME_DAY && firstCycle;
  const coin = day === COIN_DAY || (day === COSTUME_DAY && !firstCycle);
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
      <View
        style={[
          styles.circle,
          on && styles.on,
          next && styles.next,
          costume && !on && styles.costume,
        ]}
      >
        {on ? (
          <Ionicons name="checkmark" size={18} color={colors.onBrand} />
        ) : costume ? (
          // 코스튬 예시 자리. 영상이 들어오기 전까지 기본 캐릭터 그림을 놓는다
          <Image source={outfitSource("outfit-06")} style={styles.costumeImg} />
        ) : coin ? (
          <T size={11} weight="800" color={colors.warn} num>
            +{MILESTONE_COIN}
          </T>
        ) : null}
      </View>
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
    paddingHorizontal: 6,
    borderRadius: 18,
    backgroundColor: colors.sunken,
  },
  // 칸 일곱이 폭을 나눠 가지므로 원은 칸을 넘지 않는다(겹침 방지)
  col: {
    flex: 1,
    minWidth: 0,
    alignItems: "center",
    gap: 6,
    paddingHorizontal: 1,
  },
  circle: {
    width: "100%",
    maxWidth: CIRCLE_MAX,
    aspectRatio: 1,
    borderRadius: CIRCLE_MAX,
    backgroundColor: "#fff",
    alignItems: "center",
    justifyContent: "center",
    overflow: "hidden",
  },
  on: { backgroundColor: colors.brand },
  next: { borderWidth: 2, borderColor: colors.brand },
  costume: { borderWidth: 1.5, borderColor: colors.textFaint },
  costumeImg: { width: "100%", height: "100%" },
});
