import { Modal, StyleSheet, View } from "react-native";
import { Button, T } from "@/real/components/ui";
import { colors, floating } from "@/real/theme";
import type { CoinReward } from "./types";

// 서버는 SIGNUP_GIFT·BUDGET_BONUS·REFERRAL_INVITER·REFUND만 안내로 보낸다(나머지 사유는 만들 때 본 것으로 기록).
// 계약의 reason에는 다른 사유도 있으므로 모르는 사유는 일반 문구로 보여 준다.
const TITLES: Partial<Record<CoinReward["reason"], string>> = {
  SIGNUP_GIFT: "업데이트 기념 200코인 선물",
  BUDGET_BONUS: "어제 예산을 지켰어요",
  REFERRAL_INVITER: "추천 코드가 사용됐어요",
  REFUND: "코스튬 구매 코인을 돌려드려요",
};

function bodyOf(r: CoinReward): string {
  if (r.reason === "SIGNUP_GIFT")
    return `앱에서 쓰는 코인 ${r.amount}개를 드려요`;
  if (r.reason === "BUDGET_BONUS")
    return `보너스 코인 ${r.amount}개를 받았어요`;
  if (r.reason === "REFUND")
    return `구매한 코스튬이 레벨 코스튬으로 바뀌어 코인 ${r.amount}개를 돌려드려요. 코스튬은 계속 쓸 수 있어요`;
  if (r.reason === "REFERRAL_INVITER")
    return `친구가 내 추천 코드를 입력해서 코인 ${r.amount}개를 받았어요`;
  return `코인 ${r.amount}개를 받았어요`;
}

/** 받은 코인 안내. 부르는 쪽이 rewards 를 한 개씩 넘기고, 닫을 때 ack 한다 */
export function RewardModal({
  reward,
  onClose,
}: {
  reward: CoinReward | null;
  onClose: () => void;
}) {
  return (
    <Modal
      visible={reward !== null}
      transparent
      animationType="fade"
      onRequestClose={onClose}
    >
      <View style={styles.dim}>
        {reward && (
          <View style={[styles.dialog, floating]} accessibilityViewIsModal>
            <T size={32} style={{ textAlign: "center" }}>
              🪙
            </T>
            <T
              size={18}
              weight="700"
              accessibilityRole="header"
              style={{ textAlign: "center", marginTop: 8 }}
            >
              {TITLES[reward.reason] ?? "코인을 받았어요"}
            </T>
            <T
              size={14}
              color={colors.textSub}
              style={{ textAlign: "center", marginTop: 8, lineHeight: 21 }}
            >
              {bodyOf(reward)}
            </T>
            <T
              size={22}
              weight="800"
              color={colors.brandDark}
              num
              style={{ textAlign: "center", marginTop: 12 }}
            >
              +{reward.amount}
            </T>
            <Button label="확인" onPress={onClose} style={{ marginTop: 20 }} />
          </View>
        )}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  dim: {
    flex: 1,
    justifyContent: "center",
    padding: 28,
    backgroundColor: "rgba(0,0,0,0.45)",
  },
  dialog: { backgroundColor: "#fff", borderRadius: 20, padding: 24 },
});
