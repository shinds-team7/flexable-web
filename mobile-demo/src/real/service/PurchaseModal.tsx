import { View } from "react-native";
import { ConfirmModal, T } from "@/real/components/ui";
import { colors, radius } from "@/real/theme";
import { OutfitView } from "./OutfitView";

/** 구매 완료 안내. [적용하기]를 눌러야 코스튬이 바뀐다 */
export function PurchaseModal({
  outfit,
  busy,
  onApply,
  onClose,
}: {
  outfit: { id: string; name: string } | null;
  busy: boolean;
  onApply: () => void;
  onClose: () => void;
}) {
  return (
    <ConfirmModal
      visible={!!outfit}
      title="구매했어요"
      message={
        <View style={{ alignItems: "center", gap: 10 }}>
          {outfit && (
            <OutfitView
              outfitId={outfit.id}
              play={false}
              accessibilityLabel={`${outfit.name} 코스튬`}
              style={{
                width: 240,
                maxWidth: "100%",
                aspectRatio: 16 / 9,
                borderRadius: radius.soft,
                overflow: "hidden",
                backgroundColor: colors.stage,
              }}
            />
          )}
          <T size={14} color={colors.textSub} style={{ textAlign: "center" }}>
            코스튬을 얻었어요. 적용하면 홈 캐릭터가 바뀌어요
          </T>
        </View>
      }
      confirmLabel={busy ? "적용 중이에요" : "적용하기"}
      cancelLabel="나중에"
      onCancel={() => !busy && onClose()}
      onConfirm={() => !busy && onApply()}
    />
  );
}
