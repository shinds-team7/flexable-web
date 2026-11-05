import { CoinIcon } from "@/real/components/CoinIcon";
import { View } from "react-native";
import { Button, Card, T } from "@/real/components/ui";
import { colors } from "@/real/theme";
import { adsSupported } from "./adReward";
import type { CoinWallet } from "./types";
import { money } from "./ui";

/** 상점 맨 위: 코인 잔액과 [광고 보기]. 광고를 끝까지 보면 10코인, 하루 3번까지. */
export function AdRewardCard({
  balance,
  wallet,
  busy,
  message,
  onWatch,
}: {
  balance: number;
  wallet: CoinWallet | null;
  busy: boolean;
  message: string;
  onWatch: () => void;
}) {
  const ad = wallet?.ad;
  const left = ad ? Math.max(0, ad.dailyLimit - ad.rewardedToday) : 0;
  const hint =
    message ||
    (!adsSupported
      ? "광고는 앱에서 볼 수 있어요"
      : ad && left <= 0
        ? "오늘 광고 보상을 모두 받았어요"
        : ad
          ? `오늘 ${left}번 남았어요`
          : "");
  return (
    <Card style={{ flexDirection: "row", alignItems: "center", gap: 12 }}>
      <View style={{ flex: 1, gap: 2 }}>
        <View accessible accessibilityLabel={`코인 ${balance}개`}>
          <T size={24} weight="800" num>
            <CoinIcon size={22} />{money(balance)}
          </T>
        </View>
        {hint !== "" && (
          <T size={12} color={colors.textMuted}>
            {hint}
          </T>
        )}
      </View>
      {ad && (
        <Button
          label={`+${ad.reward} 코인`}
          disabled={busy || left <= 0 || !adsSupported}
          onPress={onWatch}
          style={{ minHeight: 44, paddingVertical: 8, paddingHorizontal: 18 }}
        />
      )}
    </Card>
  );
}
