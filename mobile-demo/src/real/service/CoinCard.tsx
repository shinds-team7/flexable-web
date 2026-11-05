import { CoinIcon } from "@/real/components/CoinIcon";
import { View } from "react-native";
import { Button, Card, T } from "@/real/components/ui";
import { colors } from "@/real/theme";
import type { CoinWallet } from "./types";
import { money } from "./ui";

/** 코인 잔액과 시간 적립 [모으기]. 코인 내역 화면 맨 위에 있다. */
export function CoinCard({
  balance,
  wallet,
  busy,
  onCollect,
}: {
  balance: number;
  wallet: CoinWallet | null;
  busy: boolean;
  onCollect: () => void;
}) {
  const ready = wallet?.passive.collectable ?? 0;
  const hint = wallet && ready <= 0 ? collectHint(wallet) : "";
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
      {wallet && (
        <View>
          <Button
            label={ready > 0 ? `모으기 +${ready}` : "모으기"}
            disabled={busy || ready <= 0}
            onPress={onCollect}
            style={{ minHeight: 44, paddingVertical: 8, paddingHorizontal: 18 }}
          />
          {ready > 0 && (
            <View
              accessibilityLabel="모을 코인 있음"
              style={{
                position: "absolute",
                top: 2,
                right: 2,
                width: 9,
                height: 9,
                borderRadius: 5,
                borderWidth: 1.5,
                borderColor: colors.card,
                backgroundColor: colors.danger,
              }}
            />
          )}
        </View>
      )}
    </Card>
  );
}

function collectHint(w: CoinWallet): string {
  const { collectedToday, dailyLimit, nextAt } = w.passive;
  if (collectedToday >= dailyLimit) return "오늘 코인을 모두 모았어요";
  if (!nextAt) return "";
  const at = new Date(nextAt).toLocaleTimeString("ko-KR", {
    timeZone: "Asia/Seoul",
    hour: "numeric",
    minute: "2-digit",
  });
  return `다음 코인은 ${at}에 쌓여요`;
}
