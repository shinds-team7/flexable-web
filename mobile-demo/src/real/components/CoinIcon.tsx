import { View } from "react-native";

/**
 * 코인 아이콘. 🪙 이모지는 Windows 10 같은 기기에 글꼴이 없어 깨져 보이므로 도형으로 그린다.
 * 글자 옆에 붙여 쓰도록 글줄 안에서 가운데 정렬된다(웹).
 */
export function CoinIcon({ size = 16 }: { size?: number }) {
  const ring = Math.max(1, Math.round(size / 8));
  return (
    <View
      accessible={false}
      importantForAccessibility="no"
      style={
        {
          display: "inline-flex",
          verticalAlign: "middle",
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor: "#F5B301",
          borderWidth: ring,
          borderColor: "#D99A00",
          alignItems: "center",
          justifyContent: "center",
          marginRight: Math.round(size / 4),
        } as object
      }
    >
      <View
        style={{
          width: size * 0.4,
          height: size * 0.4,
          borderRadius: size * 0.2,
          backgroundColor: "#FFE08A",
        }}
      />
    </View>
  );
}
