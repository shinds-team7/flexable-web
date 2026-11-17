import Ionicons from "@expo/vector-icons/Ionicons";
import { router } from "expo-router";
import { useState } from "react";
import { Pressable, View } from "react-native";
import { ConfirmModal, T } from "@/real/components/ui";
import { colors } from "@/real/theme";

/** 카드·예산 설정에서 같은 시드머니 안내를 연다. */
export function SeedMoneyHelp({
  label = false,
  size = 17,
  light = false,
  onNavigate,
}: {
  label?: boolean;
  size?: number;
  light?: boolean;
  onNavigate?: () => void;
}) {
  const [open, setOpen] = useState(false);
  const color = light ? "rgba(255,255,255,0.7)" : colors.textSub;
  return (
    <>
      <View style={{ flexDirection: "row", alignItems: "center", gap: 4 }}>
        {label && (
          <T size={size} color={color}>
            (시드머니
          </T>
        )}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel="시드머니가 무엇인지 보기"
          hitSlop={8}
          onPress={(event) => {
            event.stopPropagation();
            setOpen(true);
          }}
          style={{
            width: size,
            height: size,
            borderRadius: size / 2,
            borderWidth: 1,
            borderColor: color,
            alignItems: "center",
            justifyContent: "center",
          }}
        >
          <Ionicons name="help" size={Math.round(size * 0.7)} color={color} />
        </Pressable>
        {label && (
          <T size={size} color={color}>
            )
          </T>
        )}
      </View>
      <ConfirmModal
        visible={open}
        title="시드머니가 뭐예요?"
        message={
          "시드머니는 재테크에 쓸 수 있는 돈을 기록해 두는 곳이에요. 앱에서는 따로 쓸 일이 없고, 모아둔 돈을 기록하는 의미예요.\n\n텅장관리 웹사이트에 연동하면 이 시드머니로 투자·적금을 실험해 볼 수 있어요."
        }
        cancelLabel="닫기"
        confirmLabel="웹서비스 연동하기"
        onCancel={() => setOpen(false)}
        onConfirm={() => {
          setOpen(false);
          onNavigate?.();
          router.push("/web-links");
        }}
      />
    </>
  );
}
